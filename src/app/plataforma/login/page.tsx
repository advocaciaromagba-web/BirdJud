import { escritorioDoEndereco } from "@/lib/sessao";
import { FormularioOperador } from "@/componentes/FormularioOperador";
import { MarcaBirdJud } from "@/componentes/MarcaBirdJud";

export default async function LoginDaPlataforma() {
  const marca = await escritorioDoEndereco();
  if (marca?.id) {
    return (
      <main className="pagina-estreita">
        <h1>Endereco de escritorio</h1>
        <p className="chamada">
          O painel da plataforma fica no endereco da plataforma, nao no de um
          escritorio.
        </p>
      </main>
    );
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <MarcaBirdJud />
        <div className="cartao mt-6">
          <p className="sobretitulo">Acesso interno</p>
          <h1 className="mt-1">Painel da plataforma</h1>
          <FormularioOperador />
        </div>
      </div>
    </main>
  );
}
