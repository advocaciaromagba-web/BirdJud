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
        <h1>Endereço sem escritório</h1>
        <p className="chamada">
          A recuperação de senha é feita no endereço do escritório. Confira o
          link que você recebeu.
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
            enviamos um link para você escolher uma senha nova.
          </p>
          <FormularioEsqueciSenha />
        </>
      ) : (
        <p className="aviso-atencao mt-4">
          A recuperação automática de senha ainda não está disponível nesta
          instalação. Fale com quem administra o sistema do escritório.
        </p>
      )}
    </CartaoDoEscritorio>
  );
}
