// Ajuda comum das telas de escritorio: exige sessao e manda para o login
// quando nao ha. Evita repetir o try/catch em cada pagina.
import { redirect } from "next/navigation";
import { exigirSessao, type ContextoRota } from "./sessao";
import { SemPermissao } from "./papeis";
import type { Modulo } from "./modulos";

export async function contextoDaPagina(modulo?: Modulo): Promise<ContextoRota> {
  try {
    return await exigirSessao(modulo);
  } catch (erro) {
    if (erro instanceof SemPermissao) throw erro;
    redirect("/login");
  }
}
