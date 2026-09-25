import { escritorioDoEndereco } from "@/lib/sessao";
import { temRemetenteDaPlataforma } from "@/lib/email-plataforma";
import { CartaoDoEscritorio } from "@/componentes/CartaoDoEscritorio";
import { FormularioEsqueciSenha } from "@/componentes/FormularioEsqueciSenha";

export const metadata = { title: "Esqueci minha senha" };

export default async function PaginaEsqueciSenha() {
  const marca = await escritorioDoEndereco();

  if (!marca?.id) {
    return (
      <main className="pagina-estreita">
        <h1>Endereco sem escritorio</h1>
        <p className="chamada">
          A recuperacao de senha e feita no endereco do escritorio. Confira o
          link que voce recebeu.
        </p>
      </main>
    );
  }

  return (
    <CartaoDoEscritorio
      nome={marca.nome}
      logoUrl={marca.logoUrl}
      titulo="Esqueci minha senha"
      chamada={marca.nome}
    >
      {temRemetenteDaPlataforma() ? (
        <>
          <p className="chamada esquerda mt-3">
            Informe o e-mail da sua conta. Se ele estiver cadastrado aqui,
            enviamos um link para voce escolher uma senha nova.
          </p>
          <FormularioEsqueciSenha />
        </>
      ) : (
        <p className="aviso-atencao mt-4">
          A recuperacao automatica de senha ainda nao esta disponivel nesta
          instalacao. Fale com quem administra o sistema do escritorio.
        </p>
      )}
    </CartaoDoEscritorio>
  );
}
