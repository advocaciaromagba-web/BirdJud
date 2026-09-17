import Link from "next/link";
import { Sair } from "./Sair";

const AREAS = [
  { href: "/", rotulo: "Painel" },
  { href: "/clientes", rotulo: "Clientes" },
  { href: "/processos", rotulo: "Processos" },
  { href: "/agenda", rotulo: "Agenda" },
  { href: "/conta", rotulo: "Minha conta" },
];

/** Areas so de administrador. */
const AREAS_ADMIN = [{ href: "/usuarios", rotulo: "Usuarios" }];

export function Navegacao({ nomeEscritorio, papel }: { nomeEscritorio: string; papel: string }) {
  const areas = papel === "ADMIN" ? [...AREAS, ...AREAS_ADMIN] : AREAS;

  return (
    <header className="border-b border-neutral-200">
      <nav className="mx-auto flex max-w-3xl flex-wrap items-center gap-4 p-4 text-sm">
        <span className="font-semibold text-marca">{nomeEscritorio}</span>
        {areas.map((area) => (
          <Link key={area.href} href={area.href} className="text-neutral-600 hover:text-marca">
            {area.rotulo}
          </Link>
        ))}
        <Sair />
      </nav>
    </header>
  );
}
