import { redirect } from "next/navigation";
import { exigirOperador, SemOperador } from "@/lib/plataforma";
import { dominioDaPlataforma } from "@/lib/dominio";
import { DIAS_DE_TESTE } from "@/lib/precos";
import { NavegacaoDaPlataforma } from "@/componentes/NavegacaoDaPlataforma";
import { FormularioImplantar } from "@/componentes/FormularioImplantar";

export const dynamic = "force-dynamic";

export default async function ImplantarEscritorio() {
  let operador;
  try {
    operador = await exigirOperador();
  } catch (erro) {
    if (erro instanceof SemOperador) redirect("/plataforma/login");
    throw erro;
  }
  return (
    <main className="pagina">
      <NavegacaoDaPlataforma ativo="/plataforma/novo" operador={operador.nome} />
      <h1 className="mt-6">Implantar escritorio</h1>
      <p className="mt-2 leitura text-slate-600">
        A plataforma monta a conta e entrega pronta. Aqui nasce o escritorio, com plano, preco e
        administrador. Na tela seguinte entram a equipe, as OABs e as integracoes — cada uma testada
        antes de guardar. O escritorio so recebe os convites quando voce clicar em Entregar.
      </p>
      <FormularioImplantar dominio={dominioDaPlataforma()} diasPadrao={DIAS_DE_TESTE} />
    </main>
  );
}
