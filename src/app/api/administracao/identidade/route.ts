import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirAdministracao } from "@/lib/sessao";
import { arquivosDoCampo } from "@/lib/formulario";
import * as disco from "@/lib/armazenamento";
import {
  CorInvalida,
  ID_DO_LOGO,
  LOGO_MAXIMO_BYTES,
  TIPOS_DE_LOGO,
  exigirCor,
} from "@/lib/identidade";
import { documentoValido, formatarDocumento } from "@/lib/documentos";
import { tratarErro } from "@/lib/respostas";

export const dynamic = "force-dynamic";

const cores = z.object({
  corPrimaria: z.string().max(20),
  corSecundaria: z.string().max(20),
  telefoneAtendimento: z.string().max(30).optional(),
  cidade: z.string().max(120).optional(),
  // CNPJ do escritorio. Nao e detalhe de cadastro: sem ele o meio de
  // pagamento recusa emitir a cobranca da assinatura, e o escritorio ficaria
  // devendo uma fatura que nunca lhe foi apresentada.
  cnpj: z.string().max(20).optional(),
});

export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirAdministracao();
    const corpo = cores.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }

    // Cor que nao e cor nao entra: ela vira estilo inline no <body>, e o
    // navegador nao distingue "cor" de "resto de CSS" numa propriedade
    // personalizada.
    const primaria = exigirCor(corpo.data.corPrimaria, "principal");
    const secundaria = exigirCor(corpo.data.corSecundaria, "de destaque");

    // Conferido aqui, nao so na tela: CNPJ com digito errado so apareceria
    // como recusa do Asaas no dia da primeira fatura.
    let cnpj: string | null = null;
    const bruto = corpo.data.cnpj?.trim();
    if (bruto) {
      if (!documentoValido(bruto)) {
        return NextResponse.json(
          { erro: "O CNPJ informado nao fecha o digito verificador." },
          { status: 400 },
        );
      }
      cnpj = formatarDocumento(bruto);
    }

    await comEscritorio(escritorioId, (db) =>
      db.escritorio.update({
        where: { id: escritorioId },
        data: {
          corPrimaria: primaria,
          corSecundaria: secundaria,
          telefoneAtendimento: corpo.data.telefoneAtendimento || null,
          cidade: corpo.data.cidade || null,
          ...(bruto !== undefined ? { cnpj } : {}),
        },
      }),
    );

    return NextResponse.json({ ok: true, corPrimaria: primaria, corSecundaria: secundaria });
  } catch (erro) {
    if (erro instanceof CorInvalida) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}

/** Envio do logotipo. */
export async function PUT(req: Request) {
  try {
    const { escritorioId } = await exigirAdministracao();
    const formulario = await req.formData();
    const arquivo = arquivosDoCampo(formulario, "logo")[0];

    if (!arquivo) {
      return NextResponse.json(
        { erro: "Escolha a imagem do logotipo." },
        { status: 400 },
      );
    }
    if (!TIPOS_DE_LOGO.includes(arquivo.type)) {
      return NextResponse.json(
        { erro: "O logotipo precisa ser PNG, JPG, WEBP ou SVG." },
        { status: 400 },
      );
    }
    if (arquivo.size > LOGO_MAXIMO_BYTES) {
      return NextResponse.json(
        { erro: "O logotipo precisa ter menos de 1 MB." },
        { status: 413 },
      );
    }

    const conteudo = Buffer.from(await arquivo.arrayBuffer());
    await disco.gravar(escritorioId, ID_DO_LOGO, conteudo);

    // A URL leva a data: sem isso o navegador serviria o logotipo antigo do
    // cache, e o escritorio acharia que o envio nao funcionou.
    const url = `/api/marca/logo?v=${Date.now()}`;
    await comEscritorio(escritorioId, (db) =>
      db.escritorio.update({
        where: { id: escritorioId },
        data: { logoUrl: url },
      }),
    );

    return NextResponse.json({ ok: true, logoUrl: url });
  } catch (erro) {
    return tratarErro(erro);
  }
}

export async function DELETE() {
  try {
    const { escritorioId } = await exigirAdministracao();
    await disco.apagar(escritorioId, ID_DO_LOGO);
    await comEscritorio(escritorioId, (db) =>
      db.escritorio.update({
        where: { id: escritorioId },
        data: { logoUrl: null },
      }),
    );
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return tratarErro(erro);
  }
}
