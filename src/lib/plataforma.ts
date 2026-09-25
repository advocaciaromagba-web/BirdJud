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
  constructor(motivo = "Sessao de operador ausente ou invalida.") {
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
      "O painel da plataforma nao abre dentro de um escritorio.",
    );
  }

  const sessao = await getServerSession(opcoesAuth);
  if (!sessao || sessao.papel !== PAPEL_OPERADOR || sessao.escritorioId) {
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
export async function registrarAcessoSuporte(
  operadorId: string,
  escritorioId: string,
  motivo: string,
): Promise<void> {
  await prismaPlataforma().acessoSuporte.create({
    data: { operadorId, escritorioId, motivo },
  });
}
