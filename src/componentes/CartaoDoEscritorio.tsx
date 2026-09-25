import { MARCA_NEUTRA } from "@/lib/escritorio";

/** A moldura das telas de entrada: logo do escritorio, titulo e conteudo. */
export function CartaoDoEscritorio({
  nome,
  logoUrl,
  titulo,
  chamada,
  children,
  rodape,
}: {
  nome: string;
  logoUrl?: string | null;
  titulo: string;
  chamada?: string;
  children: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="cartao">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={nome}
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
                {(nome || MARCA_NEUTRA.nome).slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-xl">{titulo}</h1>
              <p className="text-sm text-slate-500">{chamada ?? nome}</p>
            </div>
          </div>

          {children}
        </div>

        {rodape ? <div className="mt-4 text-center">{rodape}</div> : null}
      </div>
    </main>
  );
}
