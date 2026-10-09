import Link from "next/link";
import { MarcaBirdJud } from "./MarcaBirdJud";

const ITENS = [
  { href: "/plataforma", rotulo: "Painel" },
  { href: "/plataforma/escritorios", rotulo: "Escritorios" },
  { href: "/plataforma/novo", rotulo: "Implantar escritorio" },
] as const;

/** Cabecalho do console da plataforma: a marca, as tres areas e quem esta logado. */
export function NavegacaoDaPlataforma({
  ativo,
  operador,
}: {
  ativo: (typeof ITENS)[number]["href"] | null;
  operador: string;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
      <div className="flex flex-wrap items-center gap-6">
        <MarcaBirdJud />
        <nav className="flex flex-wrap gap-1" aria-label="Console da plataforma">
          {ITENS.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={ativo === i.href ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                ativo === i.href
                  ? "bg-slate-900 font-semibold text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {i.rotulo}
            </Link>
          ))}
        </nav>
      </div>
      <p className="text-sm text-slate-500">operador: {operador}</p>
    </header>
  );
}
