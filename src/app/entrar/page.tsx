import type { Metadata } from "next";
import { CabecalhoPublico } from "@/componentes/CabecalhoPublico";
import { FormularioEntrar } from "@/componentes/FormularioEntrar";
import { dominioDaPlataforma } from "@/lib/dominio";

export const metadata: Metadata = {
  title: "Entrar no meu escritório — BirdJud",
  description:
    "Cada escritório entra pelo próprio endereço. Digite o nome do seu para ir direto à tela de acesso.",
};

export default function Entrar() {
  const dominio = dominioDaPlataforma();
  return (
    <>
      <CabecalhoPublico />
      <main className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-bold">Entrar no meu escritório</h1>
        <p className="mt-2 text-sm text-slate-600">
          Cada escritório tem o próprio endereço. Digite o nome do seu e você
          vai direto para a tela de acesso dele.
        </p>
        <div className="mt-8">
          <FormularioEntrar dominio={dominio} />
        </div>
      </main>
    </>
  );
}
