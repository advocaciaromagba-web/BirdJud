import Link from "next/link";
import { escritorioDoEndereco } from "@/lib/sessao";
import { FormularioRedefinirSenha } from "@/componentes/FormularioRedefinirSenha";
import { MarcaBirdJud } from "@/componentes/MarcaBirdJud";

export const metadata = { title: "Senha nova do console" };

export default async function RedefinirSenhaDoConsole({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const marca = await escritorioDoEndereco();
  const token = (await searchParams).t ?? "";
  if (marca?.id) {
    return (
      <main className="pagina-estreita">
        <h1>Endereço de escritório</h1>
        <p className="chamada">O console da plataforma fica no endereço da plataforma.</p>
      </main>
    );
  }
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <MarcaBirdJud />
        <div className="cartao mt-6">
          <p className="sobretitulo">Acesso interno</p>
          <h1 className="mt-1">Senha nova do console</h1>
          {token ? (
            <>
              {/* O token so e conferido ao trocar, na rota: dizer "link
                  invalido" antes entregaria a quem tenta adivinhar. */}
              <p className="chamada esquerda mt-3">
                Escolha uma senha nova, com pelo menos 12 caracteres. Ao trocar, as sessões abertas do console são
                encerradas.
              </p>
              <FormularioRedefinirSenha token={token} rota="/api/plataforma/senha/redefinir" entrada="/plataforma/login" minimo={12} />
            </>
          ) : (
            <p className="aviso-atencao mt-4">
              Link incompleto. Abra o link do e-mail inteiro, ou peça outro em{" "}
              <Link href="/plataforma/esqueci-senha" className="underline">esqueci a senha</Link>.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
