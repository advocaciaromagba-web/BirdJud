// Busca unica: cliente, processo, publicacao e arquivo no mesmo campo.
//
// Um escritorio nao pensa em tabelas. Ele lembra "aquele caso do Souza" ou
// tem o numero do processo em um papel — e nao sabe se o que procura esta em
// cliente, processo ou publicacao. Por isso a busca e uma so.
//
// Dois cuidados que mudam o resultado no uso real:
//
//   1. Numero de processo casa com ou sem mascara, porque e assim que ele
//      circula: o usuario copia de um lugar formatado e cola aqui.
//   2. O texto da publicacao entra na busca, mas o trecho devolvido e curto —
//      a lista precisa caber na tela, e o texto inteiro esta a um clique.
import { comEscritorio } from "./prisma";
import { modulosAtivos } from "./modulos";
import { normalizarNumeroProcesso } from "./leitura-publicacao";

export type Achado = {
  tipo: "CLIENTE" | "PROCESSO" | "PUBLICACAO" | "ARQUIVO";
  id: string;
  titulo: string;
  detalhe: string | null;
  destino: string;
};

export const MINIMO_DE_LETRAS = 3;
const POR_TIPO = 8;

export function termoUtil(termo: string): string | null {
  const limpo = termo.trim();
  // Menos que isso devolve o escritorio inteiro e nao ajuda ninguem.
  return limpo.length >= MINIMO_DE_LETRAS ? limpo : null;
}

function recortar(texto: string, limite = 160): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length <= limite ? limpo : `${limpo.slice(0, limite)}…`;
}

export async function buscar(
  escritorioId: string,
  termoBruto: string,
): Promise<Achado[]> {
  const termo = termoUtil(termoBruto);
  if (!termo) return [];

  const modulos = await modulosAtivos(escritorioId);
  // Numero digitado com mascara vira a grafia que o banco guarda.
  const comoNumero =
    normalizarNumeroProcesso(termo) ?? termo.replace(/\D/g, "");
  const porNumero = comoNumero.length >= 4 ? comoNumero : null;

  const contem = { contains: termo, mode: "insensitive" as const };

  const dados = await comEscritorio(escritorioId, async (db) => ({
    clientes: await db.cliente.findMany({
      where: {
        OR: [
          { nome: contem },
          { email: contem },
          ...(porNumero ? [{ documento: { contains: porNumero } }] : []),
        ],
      },
      orderBy: { nome: "asc" },
      take: POR_TIPO,
    }),
    processos: await db.processo.findMany({
      where: {
        OR: [
          ...(porNumero ? [{ numero: { contains: porNumero } }] : []),
          { numero: contem },
          { vara: contem },
          { area: contem },
        ],
      },
      include: { cliente: { select: { nome: true } } },
      orderBy: { criadoEm: "desc" },
      take: POR_TIPO,
    }),
    publicacoes: modulos.includes("PUBLICACOES_DJEN")
      ? await db.publicacao.findMany({
          where: {
            OR: [
              { texto: contem },
              ...(porNumero
                ? [{ numeroProcesso: { contains: porNumero } }]
                : []),
            ],
          },
          orderBy: { dataDisponibilizacao: "desc" },
          take: POR_TIPO,
        })
      : [],
    arquivos: modulos.includes("NUVEM")
      ? await db.arquivo.findMany({
          where: { OR: [{ nome: contem }, { descricao: contem }] },
          orderBy: { criadoEm: "desc" },
          take: POR_TIPO,
        })
      : [],
  }));

  const achados: Achado[] = [];

  for (const cliente of dados.clientes) {
    achados.push({
      tipo: "CLIENTE",
      id: cliente.id,
      titulo: cliente.nome,
      detalhe: cliente.documento ?? cliente.email ?? null,
      destino: "/clientes",
    });
  }
  for (const processo of dados.processos) {
    achados.push({
      tipo: "PROCESSO",
      id: processo.id,
      titulo: processo.numero,
      detalhe:
        [processo.cliente?.nome, processo.vara, processo.area]
          .filter(Boolean)
          .join(" · ") || null,
      // Processo tem ficha propria: a busca leva direto a ela.
      destino: `/processos/${processo.id}`,
    });
  }
  for (const publicacao of dados.publicacoes) {
    achados.push({
      tipo: "PUBLICACAO",
      id: publicacao.id,
      titulo: publicacao.numeroProcesso ?? "Publicacao sem numero de processo",
      detalhe: recortar(publicacao.texto),
      destino: "/publicacoes",
    });
  }
  for (const arquivo of dados.arquivos) {
    achados.push({
      tipo: "ARQUIVO",
      id: arquivo.id,
      titulo: arquivo.nome,
      detalhe: arquivo.descricao,
      destino: "/arquivos",
    });
  }

  return achados;
}
