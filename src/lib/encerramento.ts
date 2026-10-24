// Encerramento do escritorio e exclusao depois do prazo de retencao.
//
// Sao dois momentos de proposito: encerrar interrompe o servico e comeca a
// contar o prazo; purgar apaga. Entre um e outro o escritorio ainda consegue
// exportar o que e dele — e a promessa do contrato e da LGPD.
import { prismaPlataforma } from "./prisma";
import { PRAZO_DE_RETENCAO_DIAS } from "./juridico";
import { apagarTudoDoEscritorio } from "./armazenamento";
import { cancelarCobrancasAbertas } from "./cobranca-plataforma";

const DIA = 24 * 60 * 60 * 1000;

export function podePurgar(
  encerradoEm: Date | null,
  purgadoEm: Date | null,
  agora = new Date(),
  prazoDias = PRAZO_DE_RETENCAO_DIAS,
): boolean {
  if (!encerradoEm || purgadoEm) return false;
  return agora.getTime() - encerradoEm.getTime() >= prazoDias * DIA;
}

export async function encerrarEscritorio(
  escritorioId: string,
  agora = new Date(),
) {
  return prismaPlataforma().escritorio.update({
    where: { id: escritorioId },
    data: { status: "ENCERRADO", encerradoEm: agora },
  });
}

/** Desfaz o encerramento enquanto o prazo de retencao ainda corre. */
export async function reativarEscritorio(escritorioId: string) {
  return prismaPlataforma().escritorio.update({
    where: { id: escritorioId },
    data: { status: "ATIVO", encerradoEm: null },
  });
}

export type ResultadoDaPurga = {
  apagados: number;
  escritorios: string[];
};

/**
 * O que fica depois da purga, de proposito: faturas, assinatura, aceites de
 * termos e as notas fiscais que a PLATAFORMA emitiu para o escritorio. Sao
 * registro fiscal e prova de contrato da Blackbird, e o acordo de LGPD diz
 * que ficam, em base separada dos dados do escritorio. O registro de acesso
 * de suporte tambem fica: tem o proprio expurgo, de 12 meses.
 */
export const TABELAS_QUE_FICAM = new Set(["Fatura", "Assinatura", "AceiteDeTermos", "NotaDaPlataforma", "AcessoSuporte"]);

export class PurgaIncompleta extends Error {
  constructor(tabelas: string[]) {
    super(`A purga nao conseguiu apagar: ${tabelas.join(", ")}.`);
    this.name = "PurgaIncompleta";
  }
}

/**
 * Apaga todo dado de UM escritorio, menos o que fica (TABELAS_QUE_FICAM), e
 * marca purgadoEm. Fica a casca do escritorio (id, slug, nome).
 *
 * As tabelas sao descobertas no banco (toda tabela com coluna escritorioId),
 * e nao listadas a mao: a lista a mao parou em 15 de 38 tabelas, e tarefas,
 * entrevistas, contratos e notas fiscais dos clientes sobreviviam a purga
 * (corrigido em 23/10/2026). Modulo novo entra sozinho.
 *
 * A ordem entre tabelas nao importa: cada exclusao roda num ponto de
 * salvamento, e a que esbarrar numa chave estrangeira volta para a fila da
 * proxima rodada. Tudo numa transacao: ou some tudo, ou nao some nada.
 */
export async function purgarEscritorio(escritorioId: string, agora = new Date()): Promise<void> {
  const db = prismaPlataforma();
  const tabelas = (
    await db.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.columns
       WHERE column_name = 'escritorioId' AND table_schema = current_schema()`
  )
    .map((t) => t.table_name)
    .filter((t) => !TABELAS_QUE_FICAM.has(t));

  await db.$transaction(
    async (tx) => {
      let pendentes = tabelas;
      for (let rodada = 0; pendentes.length && rodada < tabelas.length; rodada++) {
        const travadas: string[] = [];
        for (const tabela of pendentes) {
          await tx.$executeRawUnsafe("SAVEPOINT purga");
          try {
            // Nome vindo do proprio catalogo do banco, entre aspas: nao e entrada de ninguem.
            await tx.$executeRawUnsafe(`DELETE FROM "${tabela.replace(/"/g, "")}" WHERE "escritorioId" = $1`, escritorioId);
            await tx.$executeRawUnsafe("RELEASE SAVEPOINT purga");
          } catch {
            await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT purga");
            travadas.push(tabela);
          }
        }
        if (travadas.length === pendentes.length) throw new PurgaIncompleta(travadas);
        pendentes = travadas;
      }
      await tx.escritorio.update({ where: { id: escritorioId }, data: { purgadoEm: agora } });
    },
    { timeout: 60_000 },
  );

  // Depois do commit: disco nao participa de transacao, e apagar byte de
  // escritorio que ja nao tem linha nenhuma e sempre seguro.
  await apagarTudoDoEscritorio(escritorioId);
}

/** Apaga os dados dos escritorios encerrados ha mais tempo que o prazo. */
export async function purgarEncerrados(
  agora = new Date(),
): Promise<ResultadoDaPurga> {
  const limite = new Date(agora.getTime() - PRAZO_DE_RETENCAO_DIAS * DIA);

  const candidatos = await prismaPlataforma().escritorio.findMany({
    where: {
      status: "ENCERRADO",
      encerradoEm: { not: null, lte: limite },
      purgadoEm: null,
    },
    select: { id: true, slug: true },
  });

  for (const escritorio of candidatos) await purgarEscritorio(escritorio.id, agora);

  return {
    apagados: candidatos.length,
    escritorios: candidatos.map((e) => e.slug),
  };
}

export class ExclusaoRecusada extends Error {
  readonly status = 400;
  constructor(motivo: string) {
    super(motivo);
    this.name = "ExclusaoRecusada";
  }
}

/**
 * Exclusao definitiva pelo console, sem esperar o prazo de retencao. Para o
 * escritorio de teste, para o pedido de eliminacao do titular (LGPD) e para
 * cadastro feito por engano.
 *
 *  - sem historico fiscal (nenhuma fatura paga, nenhuma nota da plataforma):
 *    some tudo, inclusive a casca; o endereco fica livre;
 *  - com historico fiscal: apaga todos os dados e guarda faturas, assinatura,
 *    aceites e notas (obrigacao da Blackbird), com a casca marcada como
 *    purgada.
 *
 * Exige digitar o endereco do escritorio e o motivo, que ficam no registro
 * de suporte antes de qualquer exclusao.
 */
export async function excluirEscritorio(
  escritorioId: string,
  pedido: { confirmacao: string; motivo: string; operadorId: string },
  agora = new Date(),
): Promise<{ modo: "APAGADO" | "PURGADO"; slug: string }> {
  const db = prismaPlataforma();
  const escritorio = await db.escritorio.findUnique({
    where: { id: escritorioId },
    select: { id: true, slug: true, purgadoEm: true, status: true, encerradoEm: true },
  });
  if (!escritorio) throw new ExclusaoRecusada("Escritório não encontrado.");
  if (pedido.confirmacao.trim().toLowerCase() !== escritorio.slug) {
    throw new ExclusaoRecusada(`Para confirmar, digite o endereço do escritório: ${escritorio.slug}`);
  }
  if (pedido.motivo.trim().length < 10) throw new ExclusaoRecusada("Explique o motivo com pelo menos 10 caracteres: fica registrado.");

  const [pagas, notas] = await Promise.all([
    db.fatura.count({ where: { escritorioId, status: "PAGA" } }),
    db.notaDaPlataforma.count({ where: { escritorioId } }),
  ]);
  const temFiscal = pagas > 0 || notas > 0;
  const registrar = (oQue: string) =>
    db.acessoSuporte.create({
      data: { operadorId: pedido.operadorId, escritorioId, motivo: `${oQue}: ${pedido.motivo.trim()}`, encerradoEm: agora },
    });

  // Boleto em aberto no Asaas sai antes de tudo: se o Asaas recusar, nada
  // foi apagado e o escritorio segue como estava.
  try {
    await cancelarCobrancasAbertas(escritorioId);
  } catch (erro) {
    throw new ExclusaoRecusada(
      `Não deu para cancelar as cobranças em aberto no Asaas, e nada foi apagado. ${erro instanceof Error ? erro.message : ""}`.trim(),
    );
  }

  if (!escritorio.purgadoEm) {
    await db.escritorio.update({ where: { id: escritorioId }, data: { status: "ENCERRADO", encerradoEm: agora } });
    try {
      await purgarEscritorio(escritorioId, agora);
    } catch (erro) {
      // A purga e uma transacao so: falhou, nada foi apagado. O escritorio
      // volta ao ar como estava, e o registro diz que foi tentativa.
      await db.escritorio.update({
        where: { id: escritorioId },
        data: { status: escritorio.status, encerradoEm: escritorio.encerradoEm },
      });
      await registrar(`Tentativa de exclusão definitiva, sem sucesso (nada apagado; cobranças em aberto canceladas)`);
      throw erro;
    }
  }
  await registrar(`Exclusão definitiva (${temFiscal ? "dados apagados, registro fiscal guardado" : "tudo apagado"})`);
  if (temFiscal) return { modo: "PURGADO", slug: escritorio.slug };

  // Sem nada fiscal: some tambem o que ficaria, e a casca.
  await db.$transaction([
    db.fatura.deleteMany({ where: { escritorioId } }),
    db.assinatura.deleteMany({ where: { escritorioId } }),
    db.aceiteDeTermos.deleteMany({ where: { escritorioId } }),
    db.escritorio.delete({ where: { id: escritorioId } }),
  ]);
  return { modo: "APAGADO", slug: escritorio.slug };
}
