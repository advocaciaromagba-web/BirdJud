import { NextResponse } from "next/server";
import { comEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";

export const dynamic = "force-dynamic";

/** O XML autorizado da NFS-e — e o que o contador importa. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId } = await exigirSessao("NFSE", "NOTAS");
    const { id } = await params;
    const nota = await comEscritorio(escritorioId, (db) => db.notaFiscal.findFirst({ where: { id } }));
    if (!nota?.xmlRetorno) return NextResponse.json({ erro: "Nota sem XML autorizado." }, { status: 404 });
    const nome = `NFS-e ${nota.numeroNaPrefeitura ?? nota.numero ?? ""}`.trim();
    return new NextResponse(nota.xmlRetorno, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nome}.xml"`,
      },
    });
  } catch (erro) {
    return tratarErro(erro);
  }
}
