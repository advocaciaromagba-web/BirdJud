import { NextResponse } from "next/server";
import { comEscritorio, semEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { arquivosDoCampo } from "@/lib/formulario";
import { registrarTentativa } from "@/lib/limite";
import { registrarConsumo } from "@/lib/consumo";
import {
  AnexoRecusado,
  IARecusou,
  MAXIMO_DE_ANEXOS,
  MAXIMO_DE_BYTES,
  milTokens,
  pedirSobreDocumentos,
  SemChaveDeIA,
  type Anexo,
} from "@/lib/ia";
import {
  interpretar,
  LeituraIlegivel,
  montarInstrucao,
  PERFIS,
  type Perfil,
} from "@/lib/leitura-documento";

export const dynamic = "force-dynamic";

/**
 * Teto mais apertado que o da analise de texto.
 *
 * Ler documento custa varias vezes mais do que ler publicacao: a pagina
 * digitalizada vira muito token de entrada. Quem cadastra cliente nao
 * cadastra trinta por hora.
 */
const POR_ESCRITORIO = 40;
const POR_PESSOA = 20;
const JANELA = 60 * 60;

const SISTEMA =
  "Voce e um assistente de cadastro de um escritorio de advocacia. " +
  "Voce nunca grava nada: sua saida e uma proposta que uma pessoa vai conferir.";

export async function POST(req: Request) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao("IA");

    for (const [chave, teto] of [
      [`ia-leitura:${escritorioId}`, POR_ESCRITORIO],
      [`ia-leitura:${escritorioId}:${usuarioId}`, POR_PESSOA],
    ] as const) {
      const limite = await registrarTentativa(chave, teto, JANELA);
      if (!limite.permitido) {
        return NextResponse.json(
          { erro: "Muitas leituras em pouco tempo. Tente de novo mais tarde." },
          {
            status: 429,
            headers: { "Retry-After": String(limite.esperarSegundos) },
          },
        );
      }
    }

    const formulario = await req.formData();
    const perfil = String(formulario.get("perfil") ?? "");
    if (!PERFIS.includes(perfil as Perfil)) {
      return NextResponse.json(
        { erro: "Perfil de leitura invalido." },
        { status: 400 },
      );
    }

    // Nao usar `instanceof File`: o File global so existe do Node 20 em
    // diante, e a imagem do provedor pode estar em versao anterior.
    const arquivos = arquivosDoCampo(formulario, "arquivos");
    if (arquivos.length === 0) {
      return NextResponse.json(
        { erro: "Envie ao menos um documento." },
        { status: 400 },
      );
    }
    if (arquivos.length > MAXIMO_DE_ANEXOS) {
      return NextResponse.json(
        { erro: `Envie no maximo ${MAXIMO_DE_ANEXOS} documentos por leitura.` },
        { status: 400 },
      );
    }

    // O tamanho e conferido aqui, antes de carregar tudo na memoria — e de
    // novo dentro da chamada, que e quem sabe o teto de verdade.
    const soma = arquivos.reduce((total, arquivo) => total + arquivo.size, 0);
    if (soma > MAXIMO_DE_BYTES) {
      return NextResponse.json(
        {
          erro: `Os documentos somam mais de ${Math.round(MAXIMO_DE_BYTES / (1024 * 1024))} MB.`,
        },
        { status: 413 },
      );
    }

    const anexos: Anexo[] = [];
    for (const arquivo of arquivos) {
      anexos.push({
        nome: arquivo.name.slice(0, 120),
        tipo: arquivo.type,
        dados: Buffer.from(await arquivo.arrayBuffer()),
      });
    }

    const resultado = await pedirSobreDocumentos(
      SISTEMA,
      anexos,
      montarInstrucao(perfil as Perfil),
      // Ler documento e trabalho de conferencia, nao de redacao: esforco
      // medio le bem a foto torta sem virar chamada cara.
      "medium",
    );

    const leitura = interpretar(perfil as Perfil, resultado.texto);

    // Fica gravado o que a IA propos, nao o que o escritorio aceitou: e o
    // registro de que a leitura existiu, para quando alguem perguntar de onde
    // veio o dado do cadastro.
    await comEscritorio(escritorioId, (db) =>
      db.analiseIA.create({
        data: semEscritorio({
          usuarioId,
          tipo: `LEITURA_${perfil}`,
          modelo: resultado.modelo,
          resultado: JSON.stringify(leitura),
          tokensEntrada: resultado.tokensEntrada,
          tokensSaida: resultado.tokensSaida,
        }),
      }),
    );

    await registrarConsumo(
      escritorioId,
      "IA_MIL_TOKENS",
      milTokens(resultado.tokensEntrada, resultado.tokensSaida),
    );

    return NextResponse.json({ leitura });
  } catch (erro) {
    if (
      erro instanceof SemChaveDeIA ||
      erro instanceof IARecusou ||
      erro instanceof AnexoRecusado ||
      erro instanceof LeituraIlegivel
    ) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
