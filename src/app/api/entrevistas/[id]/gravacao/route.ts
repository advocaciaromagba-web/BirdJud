import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { TAMANHO_MAXIMO_DA_GRAVACAO_MB, TAMANHO_MAXIMO_MB } from "@/lib/arquivos";
import { anexarAoEnvio, EnvioInvalido, limparEnviosVelhos } from "@/lib/armazenamento";
import {
  EntrevistaNaoEncontrada,
  guardarGravacaoDoEnvio,
  guardarGravacaoNaPasta,
} from "@/lib/entrevista-do-escritorio";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Cada pedaco que o navegador manda: 8 MB, com folga. */
const PEDACO_MAXIMO = 9 * 1024 * 1024;
const ENVIO = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * A gravacao INTEIRA feita na tela, para a pasta do cliente. A transcricao
 * ja veio por trechos (/audio); isto e so o arquivo do audio.
 *
 * Desde 17/10/2026 chega EM PARTES: ?envio=<id>&inicio=<byte>[&fim=1], com o
 * pedaco do audio no corpo. As partes vao sendo juntadas no disco e, no fim,
 * viram o arquivo da pasta — ate 300 MB (varias horas), sem nenhum pedido
 * grande e sem o arquivo inteiro na memoria. O envio antigo, de uma vez por
 * formulario (ate 25 MB), continua aceito para tela aberta antes da troca.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao(undefined, "ENTREVISTAS");
    const { id } = await params;
    const tipo = req.headers.get("content-type") ?? "";

    if (tipo.startsWith("multipart/form-data")) {
      const formulario = await req.formData();
      const audio = formulario.get("audio");
      if (!(audio instanceof File)) return NextResponse.json({ erro: "Envie a gravacao." }, { status: 400 });
      if (audio.size > TAMANHO_MAXIMO_MB * 1024 * 1024) {
        return NextResponse.json(
          { guardado: false, motivo: `A gravacao passou de ${TAMANHO_MAXIMO_MB} MB. Recarregue a pagina e grave de novo: a versao nova guarda ate ${TAMANHO_MAXIMO_DA_GRAVACAO_MB} MB.` },
          { status: 200 },
        );
      }
      const r = await guardarGravacaoNaPasta(escritorioId, id, usuarioId, {
        tipo: audio.type,
        dados: Buffer.from(await audio.arrayBuffer()),
      });
      return NextResponse.json(r);
    }

    const consulta = new URL(req.url).searchParams;
    const envio = consulta.get("envio") ?? "";
    const inicio = Number(consulta.get("inicio"));
    if (!ENVIO.test(envio) || !Number.isInteger(inicio) || inicio < 0) {
      return NextResponse.json({ erro: "Parte da gravacao sem identificacao valida." }, { status: 400 });
    }
    const declarado = Number(req.headers.get("content-length") ?? "0");
    if (declarado > PEDACO_MAXIMO) return NextResponse.json({ erro: "Parte grande demais." }, { status: 413 });
    const pedaco = Buffer.from(await req.arrayBuffer());
    if (pedaco.byteLength > PEDACO_MAXIMO) return NextResponse.json({ erro: "Parte grande demais." }, { status: 413 });

    // Primeira parte: aproveita para apagar envio abandonado de outro dia.
    if (inicio === 0) await limparEnviosVelhos(escritorioId).catch(() => {});
    const recebido = await anexarAoEnvio(escritorioId, envio, inicio, pedaco, TAMANHO_MAXIMO_DA_GRAVACAO_MB * 1024 * 1024);

    if (consulta.get("fim") !== "1") return NextResponse.json({ ok: true, recebido });
    const r = await guardarGravacaoDoEnvio(escritorioId, id, usuarioId, tipo, envio);
    return NextResponse.json(r);
  } catch (erro) {
    if (erro instanceof EntrevistaNaoEncontrada) return NextResponse.json({ erro: erro.message }, { status: erro.status });
    if (erro instanceof EnvioInvalido) {
      return NextResponse.json({ guardado: false, motivo: erro.message, erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
