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
      <h1 className="mt-6">Implantar escritório</h1>
      <p className="mt-2 leitura text-slate-600">
        A plataforma monta a conta e entrega pronta. Aqui nasce o escritório, com plano, preço e
        administrador. Na tela seguinte entram a equipe, as OABs e as integrações — cada uma testada
        antes de guardar. O escritório só recebe os convites quando você clicar em Entregar.
      </p>
      <FormularioImplantar dominio={dominioDaPlataforma()} diasPadrao={DIAS_DE_TESTE} />
    </main>
  );
}
