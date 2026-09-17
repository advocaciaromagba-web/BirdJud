// Ajuda comum das telas de escritorio.
//
// So falta de sessao manda para o login. Erro de modulo nao contratado ou de
// papel e resposta da propria tela: mandar para o login quem ja esta logado
// so confunde, e some com a informacao do que faltou.
import { redirect } from "next/navigation";
import { exigirSessao, SemSessao, type ContextoRota } from "./sessao";
import type { Modulo } from "./modulos";

export async function contextoDaPagina(modulo?: Modulo): Promise<ContextoRota> {
  try {
    return await exigirSessao(modulo);
  } catch (erro) {
    if (erro instanceof SemSessao) redirect("/login");
    throw erro;
  }
}
