import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirAdmin } from "@/lib/sessao";
import { moduloAtivo } from "@/lib/modulos";
import { type TipoIntegracao } from "@/lib/integracao";
import { ConexaoRecusada, conectarPorFormulario } from "@/lib/conectores/conectar";
import { CONECTORES, ehTipoDeIntegracao } from "@/lib/conectores";
import { tratarErro } from "@/lib/respostas";

const corpoEsperado = z.object({
  tipo: z.string(),
  dados: z.record(z.string()),
});

/**
 * Lista os conectores que ESTE escritorio pode conectar, com o estado de cada
 * um. Nunca devolve credencial: so o resumo mascarado.
 */
export async function GET() {
  try {
    const { escritorioId } = await exigirAdmin();

    const guardadas = await comEscritorio(escritorioId, (db) =>
      db.integracao.findMany({
        select: { tipo: true, status: true, erro: true, verificadoEm: true },
      }),
    );
    const porTipo = new Map(guardadas.map((i) => [i.tipo, i]));

    const lista = [];
    for (const conector of Object.values(CONECTORES)) {
      // Conector de modulo nao contratado nem aparece.
      if (
        conector.modulo &&
        !(await moduloAtivo(escritorioId, conector.modulo))
      )
        continue;
      const guardada = porTipo.get(conector.tipo);
      lista.push({
        tipo: conector.tipo,
        rotulo: conector.rotulo,
        descricao: conector.descricao,
        campos: conector.campos,
        conectada: Boolean(guardada),
        status: guardada?.status ?? null,
        erro: guardada?.erro ?? null,
        verificadoEm: guardada?.verificadoEm ?? null,
      });
    }

    return NextResponse.json({ integracoes: lista });
  } catch (erro) {
    return tratarErro(erro);
  }
}

/** Conecta (ou reconecta) uma integracao. */
export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirAdmin();
    const corpo = corpoEsperado.safeParse(await req.json());
    if (!corpo.success || !ehTipoDeIntegracao(corpo.data.tipo)) {
      return NextResponse.json(
        { erro: "Integracao desconhecida." },
        { status: 400 },
      );
    }

    let resultado;
    try {
      resultado = await conectarPorFormulario(
        escritorioId,
        corpo.data.tipo as TipoIntegracao,
        corpo.data.dados,
      );
    } catch (erro) {
      if (erro instanceof ConexaoRecusada) {
        return NextResponse.json({ erro: erro.message }, { status: erro.status });
      }
      throw erro;
    }

    return NextResponse.json({ ok: resultado.ok, detalhe: resultado.detalhe });
  } catch (erro) {
    return tratarErro(erro);
  }
}
