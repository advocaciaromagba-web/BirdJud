// O que cada tipo de trabalho faz, e como a plataforma os agenda.
//
// Todo trabalho de escritorio roda dentro de comEscritorio(): mesmo no
// trabalhador, que conecta com o papel do plano de controle, o codigo de
// negocio continua vendo so o escritorio da vez.
import { comEscritorio, prismaPlataforma } from "./prisma";
import { competenciaDe, definirConsumo } from "./consumo";
import { moduloAtivo, type Modulo } from "./modulos";
import { enfileirar } from "./fila";
import { aplicarRegua } from "./cobranca";
import { purgarEncerrados } from "./encerramento";

export type Contexto = { escritorioId: string | null; dados: unknown };

/** Apura o retrato de uso do mes: o que alimenta franquia e fatura. */
async function apurarConsumo({ escritorioId, dados }: Contexto): Promise<void> {
  if (!escritorioId) throw new Error("APURAR_CONSUMO exige escritorio.");
  const competencia =
    typeof dados === "object" && dados !== null && "competencia" in dados
      ? String((dados as { competencia: unknown }).competencia)
      : competenciaDe();

  const numeros = await comEscritorio(escritorioId, async (db) => ({
    registros:
      (await db.cliente.count()) +
      (await db.processo.count()) +
      (await db.compromisso.count()),
    usuarios: await db.usuario.count({ where: { ativo: true } }),
  }));

  await definirConsumo(escritorioId, "REGISTROS", numeros.registros, competencia);
  await definirConsumo(escritorioId, "USUARIOS_ATIVOS", numeros.usuarios, competencia);
}

/**
 * Passa a regua de cobranca: gera a fatura do mes quando o teste acabou e
 * ajusta o status do escritorio conforme o atraso.
 */
async function ruaDeCobranca({ escritorioId }: Contexto): Promise<void> {
  if (!escritorioId) throw new Error("REGUA_DE_COBRANCA exige escritorio.");
  await aplicarRegua(escritorioId);
}

/**
 * Apaga os dados de escritorios encerrados ha mais tempo que o prazo de
 * retencao. Trabalho da plataforma: nao e por escritorio, varre todos.
 */
async function purgar(): Promise<void> {
  const resultado = await purgarEncerrados();
  if (resultado.apagados > 0) {
    console.log(`Purga: ${resultado.apagados} escritorio(s): ${resultado.escritorios.join(", ")}`);
  }
}

export const EXECUTORES: Record<string, (ctx: Contexto) => Promise<void>> = {
  APURAR_CONSUMO: apurarConsumo,
  REGUA_DE_COBRANCA: ruaDeCobranca,
  PURGAR_ENCERRADOS: purgar,
};

/** Trabalhos que rodam uma vez para a plataforma toda, nao por escritorio. */
export const TRABALHOS_DA_PLATAFORMA = new Set(["PURGAR_ENCERRADOS"]);

/** Modulo exigido por tipo de trabalho. Sem modulo, so o nucleo. */
const MODULO_DO_TRABALHO: Record<string, Modulo | undefined> = {
  APURAR_CONSUMO: undefined,
  REGUA_DE_COBRANCA: undefined,
};

/**
 * Espalha um trabalho por todos os escritorios que podem receber.
 *
 * Escritorio encerrado ou suspenso fica de fora, e quem nao contratou o
 * modulo daquele trabalho tambem. E o lugar onde "rotina para o escritorio"
 * vira "uma rotina por escritorio".
 */
export async function espalhar(tipo: string, dados: Record<string, unknown> = {}): Promise<number> {
  // Trabalho da plataforma entra uma vez so, sem escritorio.
  if (TRABALHOS_DA_PLATAFORMA.has(tipo)) {
    await enfileirar(tipo, null, dados);
    return 1;
  }

  // A regua precisa alcancar tambem quem ja esta suspenso: e o pagamento
  // dele que devolve o escritorio ao ar. Encerrado fica de fora sempre.
  const alcance =
    tipo === "REGUA_DE_COBRANCA"
      ? ["TESTE", "ATIVO", "INADIMPLENTE", "SUSPENSO"]
      : ["TESTE", "ATIVO", "INADIMPLENTE"];

  const escritorios = await prismaPlataforma().escritorio.findMany({
    where: { status: { in: alcance } },
    select: { id: true },
  });

  const modulo = MODULO_DO_TRABALHO[tipo];
  let agendados = 0;

  for (const escritorio of escritorios) {
    if (modulo && !(await moduloAtivo(escritorio.id, modulo))) continue;
    await enfileirar(tipo, escritorio.id, dados);
    agendados += 1;
  }
  return agendados;
}
