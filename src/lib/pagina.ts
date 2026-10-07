// Ajuda comum das telas de escritorio.
//
// So falta de sessao manda para o login. Erro de modulo nao contratado ou de
// papel e resposta da propria tela: mandar para o login quem ja esta logado
// so confunde, e some com a informacao do que faltou.
import { redirect } from "next/navigation";
import {
  exigirAdministracao,
  exigirSessao,
  SemSessao,
  type ContextoRota,
} from "./sessao";
import { SemDestravar, SemSenhaDeAdministracao } from "./administracao";
import { SemPermissao } from "./papeis";
import type { Modulo } from "./modulos";

export async function contextoDaPagina(
  modulo?: Modulo,
  area?: string,
): Promise<ContextoRota> {
  try {
    return await exigirSessao(modulo, area);
  } catch (erro) {
    if (erro instanceof SemSessao) redirect("/login");
    // Area fechada nao e erro de sistema: e uma decisao do escritorio. A tela
    // diz isso, com o nome da area, em vez de um 403 seco que faz a pessoa
    // achar que quebrou.
    if (erro instanceof SemPermissao) redirect(`/sem-acesso?motivo=${encodeURIComponent(erro.message)}`);
    throw erro;
  }
}

/** Por que a area protegida nao abriu — ou nada, quando abriu. */
export type Tranca = "sem-permissao" | "sem-senha" | "destravar";

/**
 * Contexto das areas protegidas pela senha de administracao.
 *
 * Nao levanta: devolve o motivo, porque a tela precisa PEDIR a senha em vez de
 * dar erro. Mandar quem ja esta logado de volta para o login, ou mostrar um
 * 403 seco, e o jeito mais rapido de a pessoa achar que o sistema quebrou.
 */
export async function contextoProtegido(
  modulo?: Modulo,
): Promise<{ contexto: ContextoRota; tranca: null } | { contexto: null; tranca: Tranca }> {
  try {
    return { contexto: await exigirAdministracao(modulo), tranca: null };
  } catch (erro) {
    if (erro instanceof SemSessao) redirect("/login");
    if (erro instanceof SemPermissao) return { contexto: null, tranca: "sem-permissao" };
    if (erro instanceof SemSenhaDeAdministracao)
      return { contexto: null, tranca: "sem-senha" };
    if (erro instanceof SemDestravar) return { contexto: null, tranca: "destravar" };
    throw erro;
  }
}
