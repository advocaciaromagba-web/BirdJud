import { escritorioDoEndereco } from "@/lib/sessao";
import { DIAS_DE_TESTE } from "@/lib/precos";
import { FormularioCadastro } from "@/componentes/FormularioCadastro";
import { MarcaBirdJud } from "@/componentes/MarcaBirdJud";

export default async function PaginaCadastro() {
  // De dentro do subdominio de um escritorio nao se cria outro escritorio.
  const marca = await escritorioDoEndereco();
  if (marca?.id) {
    return (
      <main className="pagina-estreita">
        <h1>Cadastro</h1>
        <p className="chamada">
          Este endereco pertence a {marca.nome}. O cadastro de escritorios novos
          e feito no endereco da plataforma.
        </p>
      </main>
    );
  }

  const dominio = process.env.DOMINIO_PLATAFORMA ?? "birdjud.com.br";

  return (
    <main className="pagina-estreita">
      <MarcaBirdJud forma="completa" largura={300} />
      <h1 className="regua-destaque mt-8 text-3xl">
        Criar o sistema do seu escritorio
      </h1>
      <p className="chamada mt-4">
        Seu escritorio, sua marca, seus dados isolados. {DIAS_DE_TESTE} dias de
        teste, sem cartao.
      </p>
      <FormularioCadastro dominio={dominio} dias={DIAS_DE_TESTE} />
    </main>
  );
}
