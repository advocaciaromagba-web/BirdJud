import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { PrazoInvalido } from "@/lib/prazos";
import { registrarPrazo } from "@/lib/prazos-do-escritorio";

export const dynamic = "force-dynamic";

const novo = z.object({
  titulo: z.string().min(3).max(200),
  termoInicial: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dias: z.number().int().min(1).max(1000),
  contagem: z.enum(["UTEIS", "CORRIDOS"]).optional(),
  processoId: z.string().cuid().nullish(),
  clienteId: z.string().cuid().nullish(),
  responsavelId: z.string().cuid().nullish(),
  observacao: z.string().max(2000).nullish(),
});

export async function GET() {
  try {
    const { escritorioId } = await exigirSessao();
    const prazos = await comEscritorio(escritorioId, (db) =>
      db.prazo.findMany({
        orderBy: [{ cumpridoEm: "asc" }, { vencimento: "asc" }],
        take: 300,
      }),
    );
    return NextResponse.json({ prazos });
  } catch (erro) {
    return tratarErro(erro);
  }
}

export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirSessao();
    const corpo = novo.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }

    const { id, calculo } = await registrarPrazo(escritorioId, corpo.data);
    return NextResponse.json({ id, ...calculo }, { status: 201 });
  } catch (erro) {
    // A recusa do calculo e do usuario, nao do sistema: a mensagem dela
    // explica o que esta errado na data ou na quantidade de dias.
    if (erro instanceof PrazoInvalido) {
      return NextResponse.json({ erro: erro.message }, { status: 400 });
    }
    return tratarErro(erro);
  }
}
