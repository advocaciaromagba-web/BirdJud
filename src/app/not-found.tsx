import Link from "next/link";
import { escritorioDoEndereco } from "@/lib/sessao";

export default async function NaoEncontrado() {
  // Dentro do escritorio, a saida e o painel dele; fora, a capa.
  const marca = await escritorioDoEndereco();

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <p className="sobretitulo">Erro 404</p>
        <h1 className="mt-2 text-3xl">Esta pagina nao existe</h1>
        <p className="chamada esquerda mt-3">
          O endereco pode ter mudado, ou o link que voce seguiu pode estar
          incompleto.
        </p>
        <Link href="/" className="botao-principal mt-6">
          {marca?.id ? `Voltar para ${marca.nome}` : "Voltar para o inicio"}
        </Link>
      </div>
    </main>
  );
}
