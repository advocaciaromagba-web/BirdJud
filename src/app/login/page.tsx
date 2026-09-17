import { escritorioDoEndereco } from "@/lib/sessao";
import { FormularioLogin } from "@/componentes/FormularioLogin";

export default async function PaginaLogin() {
  const marca = await escritorioDoEndereco();

  if (!marca?.id) {
    return (
      <main className="mx-auto max-w-md p-10">
        <h1 className="text-2xl font-bold">Endereco sem escritorio</h1>
        <p className="mt-3 text-neutral-600">
          Cada escritorio entra pelo proprio endereco. Confira o link recebido.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-10">
      {marca.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={marca.logoUrl} alt={marca.nome} className="mb-6 h-12" />
      ) : null}
      <h1 className="text-2xl font-bold">{marca.nome}</h1>
      <p className="mt-1 text-sm text-neutral-500">Entre com suas credenciais.</p>
      <FormularioLogin />
    </main>
  );
}
