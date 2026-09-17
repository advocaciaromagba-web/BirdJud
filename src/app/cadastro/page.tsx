import { escritorioDoEndereco } from "@/lib/sessao";
import { DIAS_DE_TESTE } from "@/lib/precos";
import { FormularioCadastro } from "@/componentes/FormularioCadastro";

export default async function PaginaCadastro() {
  // De dentro do subdominio de um escritorio nao se cria outro escritorio.
  const marca = await escritorioDoEndereco();
  if (marca?.id) {
    return (
      <main className="mx-auto max-w-2xl p-10">
        <h1 className="text-2xl font-bold">Cadastro</h1>
        <p className="mt-3 text-neutral-600">
          Este endereco pertence a {marca.nome}. O cadastro de escritorios novos e
          feito no endereco da plataforma.
        </p>
      </main>
    );
  }

  const dominio = process.env.DOMINIO_PLATAFORMA ?? "birdjud.com.br";

  return (
    <main className="mx-auto max-w-xl p-10">
      <p className="text-sm uppercase tracking-wide text-marca">BirdJud</p>
      <h1 className="mt-2 text-3xl font-bold">Criar o sistema do seu escritorio</h1>
      <p className="mt-3 text-neutral-600">
        Seu escritorio, sua marca, seus dados isolados. {DIAS_DE_TESTE} dias de
        teste, sem cartao.
      </p>
      <FormularioCadastro dominio={dominio} dias={DIAS_DE_TESTE} />
    </main>
  );
}
