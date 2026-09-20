import Link from "next/link";
import type { Modulo } from "@/lib/modulos";
import { Sair } from "./Sair";
import { CampoDeBusca } from "./CampoDeBusca";

type Area = { href: string; rotulo: string; modulo?: Modulo; soAdmin?: boolean };

const AREAS: Area[] = [
  { href: "/", rotulo: "Painel" },
  { href: "/clientes", rotulo: "Clientes" },
  { href: "/processos", rotulo: "Processos" },
  { href: "/agenda", rotulo: "Agenda" },
  { href: "/publicacoes", rotulo: "Publicacoes", modulo: "PUBLICACOES_DJEN" },
  { href: "/arquivos", rotulo: "Arquivos", modulo: "NUVEM" },
  { href: "/cobrancas", rotulo: "Cobrancas", modulo: "COBRANCAS" },
  { href: "/notas", rotulo: "Notas", modulo: "NFSE" },
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
  termoDeBusca,
}: {
  nomeEscritorio: string;
  papel: string;
  modulos: Modulo[];
  termoDeBusca?: string;
}) {
  const contratados = new Set(modulos);
  const areas = AREAS.filter(
    (area) =>
      (!area.modulo || contratados.has(area.modulo)) &&
      (!area.soAdmin || papel === "ADMIN")
  );

  const links = areas.map((area) => (
    <Link
      key={area.href}
      href={area.href}
      className="-my-1 py-2 text-neutral-600 hover:text-marca"
    >
      {area.rotulo}
    </Link>
  ));

  return (
    <header className="border-b border-neutral-200">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 p-4 text-sm">
        <span className="shrink-0 font-semibold text-marca">{nomeEscritorio}</span>

        {/* Em tela larga o menu fica aberto, como sempre esteve. */}
        <div className="hidden min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 sm:flex">
          {links}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <CampoDeBusca termoInicial={termoDeBusca} />
          <Sair />
        </div>

        {/*
          No celular, doze links empilhados comiam meia tela antes do
          conteudo. Recolhido, o sistema abre no que interessa. E <details>,
          nao menu de JavaScript: funciona mesmo se o script nao carregar.
        */}
        <details className="w-full sm:hidden">
          <summary className="cursor-pointer py-2 font-semibold text-neutral-600">
            Menu
          </summary>
          <div className="mt-1 grid grid-cols-2 gap-x-4">{links}</div>
        </details>
      </nav>
    </header>
  );
}
