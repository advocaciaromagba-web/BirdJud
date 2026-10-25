import Link from "next/link";
import { escritorioDoEndereco } from "@/lib/sessao";
import { FormularioLogin } from "@/componentes/FormularioLogin";

export default async function PaginaLogin() {
  const marca = await escritorioDoEndereco();

  if (!marca?.id) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="cartao w-full max-w-md text-center">
          <h1>Endereço sem escritório</h1>
          <p className="chamada">
            Cada escritório entra pelo próprio endereço. Confira o link
            recebido.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="cartao">
          <div className="flex items-center gap-3">
            {marca.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={marca.logoUrl}
                alt={marca.nome}
                className="h-10 w-auto max-w-[10rem] object-contain"
              />
            ) : (
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-sm font-bold"
                style={{
                  backgroundColor: "var(--marca-primaria)",
                  color: "var(--marca-contraste)",
                }}
              >
                {marca.nome.slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-xl">{marca.nome}</h1>
              <p className="text-sm text-slate-500">
                Entre com suas credenciais.
              </p>
            </div>
          </div>

          {marca.status === "SUSPENSO" ? (
            // Sem isto a pessoa so via "credenciais invalidas" e ia trocar a
            // senha. O valor nao aparece: a tela de entrada e publica.
            <p role="alert" className="aviso-erro mt-4">
              O acesso deste escritório ao sistema está suspenso por pendência financeira com o BirdJud. Os dados
              estão guardados e nada foi apagado. O link de pagamento foi enviado ao e-mail do administrador do
              escritório; assim que o pagamento for confirmado, o acesso volta sozinho.
            </p>
          ) : null}

          <FormularioLogin />

          <p className="mt-4 text-center text-sm">
            <Link
              href="/esqueci-senha"
              className="text-slate-500 underline hover:text-slate-900"
            >
              Esqueci minha senha
            </Link>
          </p>
        </div>

        {marca.telefoneAtendimento ? (
          <p className="mt-4 text-center text-xs text-slate-500">
            Problemas para entrar? Fale com o escritório:{" "}
            {marca.telefoneAtendimento}
          </p>
        ) : null}
      </div>
    </main>
  );
}
