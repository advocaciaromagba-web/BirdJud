import { NextResponse } from "next/server";
import { comEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { gerarDanfse, nomeDoPdf } from "@/lib/nfse";

export const dynamic = "force-dynamic";

/** O DANFSe, gerado do XML autorizado. Nota cancelada sai com a marca. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId } = await exigirSessao("NFSE", "NOTAS");
    const { id } = await params;
    const nota = await comEscritorio(escritorioId, (db) => db.notaFiscal.findFirst({ where: { id } }));
    if (!nota?.xmlRetorno) return NextResponse.json({ erro: "Nota sem XML autorizado." }, { status: 404 });
    const pdf = await gerarDanfse(nota.xmlRetorno, { cancelada: nota.status === "CANCELADA" });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${nomeDoPdf(nota)}"`,
      },
    });
  } catch (erro) {
    return tratarErro(erro);
  }
}
