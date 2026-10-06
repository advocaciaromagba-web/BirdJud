import type { Metadata } from "next";
import { CabecalhoPublico } from "@/componentes/CabecalhoPublico";
import { FormularioEntrar } from "@/componentes/FormularioEntrar";
import { dominioDaPlataforma } from "@/lib/dominio";

export const metadata: Metadata = {
  title: "Entrar no meu escritorio — BirdJud",
  description:
    "Cada escritorio entra pelo proprio endereco. Digite o nome do seu para ir direto a tela de acesso.",
};

export default function Entrar() {
  const dominio = dominioDaPlataforma();
  return (
    <>
      <CabecalhoPublico />
      <main className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-bold">Entrar no meu escritorio</h1>
        <p className="mt-2 text-sm text-slate-600">
          Cada escritorio tem o proprio endereco. Digite o nome do seu e voce
          vai direto para a tela de acesso dele.
        </p>
        <div className="mt-8">
          <FormularioEntrar dominio={dominio} />
        </div>
      </main>
    </>
  );
}
