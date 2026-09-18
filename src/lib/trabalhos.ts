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
import { capturarPublicacoes } from "./publicacoes";
import { enviarAvisosPendentes, gerarAvisos } from "./avisos";

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

/**
 * Captura as publicacoes do DJEN das OABs monitoradas pelo escritorio.
 *
 * Falha de uma OAB nao interrompe as outras (ver publicacoes.ts); o que chega
 * aqui como erro e falha do trabalho inteiro, e a fila cuida da retentativa.
 */
async function capturar({ escritorioId }: Contexto): Promise<void> {
  if (!escritorioId) throw new Error("CAPTURAR_PUBLICACOES exige escritorio.");
  const resultado = await capturarPublicacoes(escritorioId);

  if (resultado.falhas.length > 0) {
    const nomes = resultado.falhas.map((f) => `${f.oab}: ${f.motivo}`).join(" | ");
    throw new Error(`Falha em ${resultado.falhas.length} OAB(s) — ${nomes}`);
  }
}

/**
 * Gera os avisos do escritorio e envia os pendentes.
 *
 * Gerar e enviar no mesmo trabalho porque o que interessa e o aviso CHEGAR;
 * se o envio falhar, a geracao ja aconteceu e a proxima rodada tenta de novo
 * sem duplicar.
 */
async function avisar({ escritorioId }: Contexto): Promise<void> {
  if (!escritorioId) throw new Error("AVISAR exige escritorio.");

  await gerarAvisos(escritorioId);
  const envio = await enviarAvisosPendentes(escritorioId);

  if (envio.semRemetente) {
    // Nao e erro do trabalho: e configuracao que falta no escritorio. Repetir
    // a tentativa nao ajuda, e marcar como falha encheria a fila de ruido.
    console.log(`AVISAR ${escritorioId}: e-mail nao conectado, avisos aguardando.`);
    return;
  }
  if (envio.falhas > 0) {
    throw new Error(`${envio.falhas} aviso(s) nao enviado(s).`);
  }
}

export const EXECUTORES: Record<string, (ctx: Contexto) => Promise<void>> = {
  AVISAR: avisar,
  CAPTURAR_PUBLICACOES: capturar,
  APURAR_CONSUMO: apurarConsumo,
  REGUA_DE_COBRANCA: ruaDeCobranca,
  PURGAR_ENCERRADOS: purgar,
};

/** Trabalhos que rodam uma vez para a plataforma toda, nao por escritorio. */
export const TRABALHOS_DA_PLATAFORMA = new Set(["PURGAR_ENCERRADOS"]);

/** Modulo exigido por tipo de trabalho. Sem modulo, so o nucleo. */
const MODULO_DO_TRABALHO: Record<string, Modulo | undefined> = {
  // Escritorio que nao contratou publicacoes nao gera trabalho de captura.
  CAPTURAR_PUBLICACOES: "PUBLICACOES_DJEN",
  AVISAR: "EMAIL",
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
