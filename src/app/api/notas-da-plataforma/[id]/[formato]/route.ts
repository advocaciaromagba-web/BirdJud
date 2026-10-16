import { NextResponse } from "next/server";
import { prismaPlataforma } from "@/lib/prisma";
import { gerarDanfse } from "@/lib/nfse";
import { tokenConfere } from "@/lib/nota-da-plataforma";
import { exigirOperador } from "@/lib/plataforma";

export const dynamic = "force-dynamic";

/**
 * PDF (DANFSe) ou XML da nota da mensalidade. Abre pelo link assinado do
 * e-mail (?t=...) — o escritorio nao precisa entrar — ou com sessao de
 * operador. Sem nenhum dos dois, 404: nem confirma que a nota existe.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; formato: string }> }) {
  const { id, formato } = await params;
  if (formato !== "pdf" && formato !== "xml") return NextResponse.json({ erro: "Nao encontrado." }, { status: 404 });

  const token = new URL(req.url).searchParams.get("t");
  let autorizado = false;
  try {
    autorizado = tokenConfere(id, token);
  } catch {
    autorizado = false;
  }
  if (!autorizado) {
    autorizado = await exigirOperador().then(() => true, () => false);
  }
  if (!autorizado) return NextResponse.json({ erro: "Nao encontrado." }, { status: 404 });

  const nota = await prismaPlataforma().notaDaPlataforma.findUnique({ where: { id } });
  if (!nota?.xmlRetorno) return NextResponse.json({ erro: "Nao encontrado." }, { status: 404 });

  const nome = `nfse-birdjud-${nota.numeroNaPrefeitura ?? nota.numero ?? nota.id}`;
  if (formato === "xml") {
    return new NextResponse(nota.xmlRetorno, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nome}.xml"`,
      },
    });
  }
  const pdf = await gerarDanfse(nota.xmlRetorno, { cancelada: nota.status === "CANCELADA" });
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${nome}.pdf"` },
  });
}
