import { escritorioDoEndereco } from "@/lib/sessao";
import { FormularioOperador } from "@/componentes/FormularioOperador";

export default async function LoginDaPlataforma() {
  const marca = await escritorioDoEndereco();
  if (marca?.id) {
    return (
      <main className="mx-auto max-w-md p-10">
        <h1 className="text-2xl font-bold">Endereco de escritorio</h1>
        <p className="mt-3 text-neutral-600">
          O painel da plataforma fica no endereco da plataforma, nao no de um
          escritorio.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-10">
      <p className="text-sm uppercase tracking-wide text-marca">BirdJud</p>
      <h1 className="mt-2 text-2xl font-bold">Painel da plataforma</h1>
      <FormularioOperador />
    </main>
  );
}
