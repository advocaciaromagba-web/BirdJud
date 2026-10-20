import { escritorioDoEndereco } from "@/lib/sessao";
import { temRemetenteDaPlataforma } from "@/lib/email-plataforma";
import { FormularioEsqueciSenha } from "@/componentes/FormularioEsqueciSenha";
import { MarcaBirdJud } from "@/componentes/MarcaBirdJud";

export const metadata = { title: "Esqueci a senha do console" };

export default async function EsqueciSenhaDoConsole() {
  const marca = await escritorioDoEndereco();
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
          <h1 className="mt-1">Esqueci a senha</h1>
          {temRemetenteDaPlataforma() ? (
            <>
              <p className="chamada esquerda mt-3">
                Informe o e-mail de operador. Se ele for de um operador ativo, enviamos um link para escolher a
                senha nova. O link vale por 30 minutos.
              </p>
              <FormularioEsqueciSenha
                rota="/api/plataforma/senha/esqueci"
                entrada="/plataforma/login"
                ajuda="O e-mail com que você entra no console da plataforma."
              />
            </>
          ) : (
            <p className="aviso-atencao mt-4">A recuperação por e-mail não está configurada nesta instalação.</p>
          )}
        </div>
      </div>
    </main>
  );
}
