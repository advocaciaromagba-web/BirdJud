// Guarda das telas e rotas do operador da plataforma.
//
// O operador nao pertence a escritorio nenhum: a sessao dele carrega
// escritorioId vazio, e por isso a guarda do escritorio (exigirSessao) nunca
// o deixa entrar em um. O caminho oposto tambem e fechado: estas rotas so
// respondem no endereco da plataforma.
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { opcoesAuth } from "./auth";
import { PAPEL_OPERADOR } from "./auth-comum";
import { CABECALHO_SLUG } from "./subdominio";
import { prismaPlataforma } from "./prisma";

export class SemOperador extends Error {
  readonly status = 401;
  constructor(motivo = "Sessão de operador ausente ou inválida.") {
    super(motivo);
    this.name = "SemOperador";
  }
}

export type ContextoOperador = {
  operadorId: string;
  nome: string;
};

export async function exigirOperador(): Promise<ContextoOperador> {
  if ((await headers()).get(CABECALHO_SLUG)) {
    throw new SemOperador(
      "O painel da plataforma não abre dentro de um escritório.",
    );
  }

  const sessao = await getServerSession(opcoesAuth);
  if (!sessao || sessao.papel !== PAPEL_OPERADOR || sessao.escritorioId) {
    throw new SemOperador();
  }

  // O JWT pode continuar no navegador depois que o operador e desativado.
  // Acesso ao plano de controle exige que a conta ainda exista e esteja ativa.
  const operador = await prismaPlataforma().operadorPlataforma.findUnique({
    where: { id: sessao.usuarioId },
    select: { ativo: true, sessoesValidasApos: true },
  });
  if (!operador?.ativo) throw new SemOperador();
  // Senha trocada depois que esta sessao foi aberta: ela nao vale mais.
  if (operador.sessoesValidasApos && (sessao.emitidaEm ?? 0) < operador.sessoesValidasApos.getTime()) {
    throw new SemOperador();
  }

  return {
    operadorId: sessao.usuarioId,
    nome: sessao.user?.name ?? "operador",
  };
}

/**
 * Registra que um operador olhou os dados de um escritorio.
 *
 * Toda abertura de escritorio no painel passa por aqui. Sem isso, o acesso de
 * suporte seria invisivel — e e exatamente o acesso que mais precisa de
 * rastro, porque atravessa o isolamento.
 */
/**
 * Por quanto tempo o registro de acesso do suporte fica guardado: 12 meses,
 * decisao de 11/10/2026. Acima dos 6 meses minimos do Marco Civil (art. 15)
 * para registro de acesso, e o bastante para o escritorio pedir o historico
 * de um ano inteiro.
 */
export const MESES_DE_GUARDA_DO_ACESSO_DE_SUPORTE = 12;

/** Apaga o registro de acesso de suporte mais velho que o prazo de guarda. */
export async function expurgarAcessosDeSuporte(agora = new Date()): Promise<number> {
  const limite = new Date(agora);
  limite.setMonth(limite.getMonth() - MESES_DE_GUARDA_DO_ACESSO_DE_SUPORTE);
  const r = await prismaPlataforma().acessoSuporte.deleteMany({ where: { iniciadoEm: { lt: limite } } });
  return r.count;
}

export async function registrarAcessoSuporte(
  operadorId: string,
  escritorioId: string,
  motivo: string,
): Promise<void> {
  await prismaPlataforma().acessoSuporte.create({
    data: { operadorId, escritorioId, motivo },
  });
}
