// Qual porta guarda um lancamento que ja existe: a conta do escritorio
// (DESPESA) abre pela area DESPESAS, sem a segunda senha; a receita continua
// atras da senha de administracao. Decidido pelo que esta GRAVADO, nunca pelo
// que o pedido diz.
import { comEscritorio } from "./prisma";
import { exigirAdministracao, exigirDespesas, exigirSessao, type ContextoRota } from "./sessao";

export async function portaDoLancamento(id: string): Promise<{ contexto: ContextoRota; existe: boolean }> {
  const base = await exigirSessao("FINANCEIRO");
  const l = await comEscritorio(base.escritorioId, (db) => db.lancamento.findFirst({ where: { id }, select: { tipo: true } }));
  // Inexistente: quem responde "nao encontrado" e a porta mais fechada, para
  // nao servir de consulta a quem nao tem acesso nenhum ao financeiro.
  if (!l) return { contexto: await exigirDespesasOuAdministracao(), existe: false };
  return { contexto: l.tipo === "DESPESA" ? await exigirDespesas() : await exigirAdministracao("FINANCEIRO"), existe: true };
}

async function exigirDespesasOuAdministracao(): Promise<ContextoRota> {
  try {
    return await exigirDespesas();
  } catch {
    return exigirAdministracao("FINANCEIRO");
  }
}
