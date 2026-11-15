import { NextResponse } from "next/server";
import { ehArquivoEnviado } from "@/lib/formulario";
import { comEscritorio } from "@/lib/prisma";
import { portaDoLancamento } from "@/lib/porta-do-lancamento";
import { tratarErro } from "@/lib/respostas";
import { CorpoGrandeDemais, formularioLimitado } from "@/lib/multipart-limitado";
import { abrirArquivo, apagarArquivo, ArquivoNaoEncontrado, ArquivoRecusado, EspacoEsgotado, guardarArquivo, TAMANHO_MAXIMO_MB } from "@/lib/arquivos";

// O boleto e o comprovante de uma conta do escritorio (11/11/2026, vindo do
// sistema da Advocacia Roma). Passam pela MESMA porta da conta
// (portaDoLancamento), e nao pela do modulo de Arquivos: quem paga as contas
// nao precisa ter a Nuvem aberta, e quem tem a Nuvem nao ve as contas.

type Parametros = { params: Promise<{ id: string }> };
const COLUNA = { BOLETO: "arquivoId", COMPROVANTE: "comprovanteId" } as const;
type Tipo = keyof typeof COLUNA;
const ehTipo = (t: unknown): t is Tipo => t === "BOLETO" || t === "COMPROVANTE";
/** So o que um boleto ou comprovante e de verdade. */
const TIPOS_DE_ANEXO = new Set(["application/pdf", "image/jpeg", "image/png", "image/heic"]);

const naoEncontrado = () => NextResponse.json({ erro: "Lançamento não encontrado." }, { status: 404 });

export async function GET(req: Request, { params }: Parametros) {
  try {
    const { id } = await params;
    const { contexto } = await portaDoLancamento(id);
    const tipo = new URL(req.url).searchParams.get("tipo");
    if (!ehTipo(tipo)) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
    const l = await comEscritorio(contexto.escritorioId, (db) => db.lancamento.findFirst({ where: { id }, select: { arquivoId: true, comprovanteId: true } }));
    const arquivoId = l?.[COLUNA[tipo]];
    if (!arquivoId) return NextResponse.json({ erro: "Não há arquivo guardado nesta conta." }, { status: 404 });
    const arquivo = await abrirArquivo(contexto.escritorioId, arquivoId);
    // Anexo e nosniff, como todo download: nada subido abre no nosso dominio.
    return new NextResponse(arquivo.corpo, {
      headers: {
        "Content-Type": arquivo.tipo,
        "Content-Length": String(arquivo.tamanho),
        "Content-Disposition": `attachment; filename="${arquivo.nome}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (erro) {
    if (erro instanceof ArquivoNaoEncontrado) return NextResponse.json({ erro: erro.message }, { status: erro.status });
    return tratarErro(erro);
  }
}

export async function POST(req: Request, { params }: Parametros) {
  try {
    const { id } = await params;
    const { contexto, existe } = await portaDoLancamento(id);
    if (!existe) return naoEncontrado();
    const formulario = await formularioLimitado(req, (TAMANHO_MAXIMO_MB + 1) * 1024 * 1024).catch((erro) => {
      if (erro instanceof CorpoGrandeDemais) throw erro;
      return null;
    });
    const enviado = formulario?.get("arquivo");
    const tipo = formulario?.get("tipo");
    if (!formulario || !ehArquivoEnviado(enviado) || !ehTipo(tipo)) {
      return NextResponse.json({ erro: "Envie o arquivo do boleto ou do comprovante." }, { status: 400 });
    }
    if (!TIPOS_DE_ANEXO.has(enviado.type)) {
      return NextResponse.json({ erro: "Boleto e comprovante entram em PDF ou imagem (JPG, PNG)." }, { status: 422 });
    }
    const { escritorioId, usuarioId } = contexto;
    const l = await comEscritorio(escritorioId, (db) =>
      db.lancamento.findFirst({ where: { id }, select: { tipo: true, descricao: true, pagoEm: true, arquivoId: true, comprovanteId: true } }),
    );
    if (!l) return naoEncontrado();
    if (l.tipo !== "DESPESA") return NextResponse.json({ erro: "Só conta a pagar guarda boleto e comprovante." }, { status: 400 });
    // Comprovante de conta em aberto e engano: da-se a baixa primeiro.
    if (tipo === "COMPROVANTE" && !l.pagoEm) {
      return NextResponse.json({ erro: "Dê baixa na conta antes de anexar o comprovante." }, { status: 409 });
    }
    const guardado = await guardarArquivo(escritorioId, {
      nome: enviado.name,
      tipo: enviado.type,
      conteudo: Buffer.from(await enviado.arrayBuffer()),
      usuarioId,
      descricao: `${tipo === "BOLETO" ? "Boleto" : "Comprovante"}: ${l.descricao}`.slice(0, 200),
    });
    const anterior = l[COLUNA[tipo]];
    await comEscritorio(escritorioId, (db) => db.lancamento.updateMany({ where: { id }, data: { [COLUNA[tipo]]: guardado.id } }));
    // Trocou o arquivo: o antigo nao tem mais quem aponte para ele.
    if (anterior) await apagarArquivo(escritorioId, anterior).catch(() => {});
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (erro) {
    if (erro instanceof ArquivoRecusado || erro instanceof EspacoEsgotado) return NextResponse.json({ erro: erro.message }, { status: erro.status });
    return tratarErro(erro);
  }
}

export async function DELETE(req: Request, { params }: Parametros) {
  try {
    const { id } = await params;
    const { contexto, existe } = await portaDoLancamento(id);
    if (!existe) return naoEncontrado();
    const tipo = new URL(req.url).searchParams.get("tipo");
    if (!ehTipo(tipo)) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
    const l = await comEscritorio(contexto.escritorioId, (db) => db.lancamento.findFirst({ where: { id }, select: { arquivoId: true, comprovanteId: true } }));
    const arquivoId = l?.[COLUNA[tipo]];
    if (arquivoId) await apagarArquivo(contexto.escritorioId, arquivoId).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return tratarErro(erro);
  }
}
