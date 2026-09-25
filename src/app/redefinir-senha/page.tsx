import Link from "next/link";
import { escritorioDoEndereco } from "@/lib/sessao";
import { CartaoDoEscritorio } from "@/componentes/CartaoDoEscritorio";
import { FormularioRedefinirSenha } from "@/componentes/FormularioRedefinirSenha";

export const metadata = { title: "Escolher uma senha nova" };

export default async function PaginaRedefinirSenha({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const marca = await escritorioDoEndereco();
  const token = (await searchParams).t ?? "";

  if (!marca?.id) {
    return (
      <main className="pagina-estreita">
        <h1>Endereco sem escritorio</h1>
        <p className="chamada">
          O link de redefinicao abre no endereco do escritorio. Confira o
          endereco recebido por e-mail.
        </p>
      </main>
    );
  }

  return (
    <CartaoDoEscritorio
      nome={marca.nome}
      logoUrl={marca.logoUrl}
      titulo="Escolher uma senha nova"
      chamada={marca.nome}
      rodape={
        <Link
          href="/login"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          Voltar para a entrada
        </Link>
      }
    >
      {token ? (
        <>
          {/* O token nao e conferido aqui: quem confere e a rota, ao trocar.
              Dizer "link invalido" antes da hora entregaria a quem tenta
              adivinhar se o token existe. */}
          <p className="chamada esquerda mt-3">
            Escolha uma senha nova. Ao trocar, as sessoes abertas em outros
            aparelhos sao encerradas.
          </p>
          <FormularioRedefinirSenha token={token} />
        </>
      ) : (
        <p className="aviso-erro mt-4">
          Este endereco precisa do link que chegou por e-mail. Peca outro na
          tela de entrada.
        </p>
      )}
    </CartaoDoEscritorio>
  );
}
