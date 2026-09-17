import Link from "next/link";
import type { Modulo } from "@/lib/modulos";
import { Sair } from "./Sair";

type Area = { href: string; rotulo: string; modulo?: Modulo; soAdmin?: boolean };

const AREAS: Area[] = [
  { href: "/", rotulo: "Painel" },
  { href: "/clientes", rotulo: "Clientes" },
  { href: "/processos", rotulo: "Processos" },
  { href: "/agenda", rotulo: "Agenda" },
  { href: "/financeiro", rotulo: "Financeiro", modulo: "FINANCEIRO" },
  { href: "/usuarios", rotulo: "Usuarios", soAdmin: true },
  { href: "/integracoes", rotulo: "Integracoes", soAdmin: true },
  { href: "/conta", rotulo: "Minha conta" },
];

/**
 * Menu com as duas camadas: area de modulo nao contratado nao aparece para
 * escritorio nenhum, e area de admin nao aparece para quem nao e admin.
 * Some do menu e, na rota, responde 403 — as duas coisas, nunca so uma.
 */
export function Navegacao({
  nomeEscritorio,
  papel,
  modulos,
}: {
  nomeEscritorio: string;
  papel: string;
  modulos: Modulo[];
}) {
  const contratados = new Set(modulos);
  const areas = AREAS.filter(
    (area) =>
      (!area.modulo || contratados.has(area.modulo)) &&
      (!area.soAdmin || papel === "ADMIN")
  );

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
