import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio, semEscritorio } from "@/lib/prisma";
import { exigirAdmin, exigirSessao } from "@/lib/sessao";
import { ehDuplicado, tratarErro } from "@/lib/respostas";

export const dynamic = "force-dynamic";

const UFS = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
] as const;

const novaOab = z.object({
  numero: z.string().min(3).max(10),
  uf: z.enum(UFS),
  nomeAdvogado: z.string().max(120).optional(),
});

export async function GET() {
  try {
    const { escritorioId } = await exigirSessao("PUBLICACOES_DJEN");
    const oabs = await comEscritorio(escritorioId, (db) =>
      db.oabMonitorada.findMany({ orderBy: { criadoEm: "asc" } }),
    );
    return NextResponse.json({ oabs });
  } catch (erro) {
    return tratarErro(erro);
  }
}

/** Cadastrar OAB muda o que o escritorio paga por consumo: so administrador. */
export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirAdmin("PUBLICACOES_DJEN");
    const corpo = novaOab.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json(
        { erro: "Numero ou UF invalidos." },
        { status: 400 },
      );
    }

    const oab = await comEscritorio(escritorioId, (db) =>
      db.oabMonitorada.create({
        data: semEscritorio({
          // So digitos: "123.456" e "123456" sao a mesma OAB.
          numero: corpo.data.numero.replace(/\D/g, ""),
          uf: corpo.data.uf,
          nomeAdvogado: corpo.data.nomeAdvogado,
        }),
      }),
    );
    return NextResponse.json({ oab }, { status: 201 });
  } catch (erro) {
    if (ehDuplicado(erro)) {
      return NextResponse.json(
        { erro: "Esta OAB ja esta sendo monitorada." },
        { status: 409 },
      );
    }
    return tratarErro(erro);
  }
}
