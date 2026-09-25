import Link from "next/link";
import type { Modulo } from "@/lib/modulos";
import { Icone, type NomeDeIcone } from "./Icone";
import { MenuLateral } from "./MenuLateral";
import { CampoDeBusca } from "./CampoDeBusca";
import { Sair } from "./Sair";

export type Area = {
  href: string;
  rotulo: string;
  icone: NomeDeIcone;
  modulo?: Modulo;
  soAdmin?: boolean;
  grupo: "trabalho" | "dinheiro" | "escritorio";
};

const AREAS: Area[] = [
  { href: "/", rotulo: "Painel", icone: "painel", grupo: "trabalho" },
  {
    href: "/clientes",
    rotulo: "Clientes",
    icone: "clientes",
    grupo: "trabalho",
  },
  {
    href: "/processos",
    rotulo: "Processos",
    icone: "processos",
    grupo: "trabalho",
  },
  { href: "/agenda", rotulo: "Agenda", icone: "agenda", grupo: "trabalho" },
  {
    href: "/publicacoes",
    rotulo: "Publicacoes",
    icone: "publicacoes",
    modulo: "PUBLICACOES_DJEN",
    grupo: "trabalho",
  },
  {
    href: "/arquivos",
    rotulo: "Arquivos",
    icone: "arquivos",
    modulo: "NUVEM",
    grupo: "trabalho",
  },
  {
    href: "/cobrancas",
    rotulo: "Cobrancas",
    icone: "cobrancas",
    modulo: "COBRANCAS",
    grupo: "dinheiro",
  },
  {
    href: "/notas",
    rotulo: "Notas fiscais",
    icone: "notas",
    modulo: "NFSE",
    grupo: "dinheiro",
  },
  {
    href: "/financeiro",
    rotulo: "Financeiro",
    icone: "financeiro",
    modulo: "FINANCEIRO",
    grupo: "dinheiro",
  },
  {
    href: "/usuarios",
    rotulo: "Usuarios",
    icone: "usuarios",
    soAdmin: true,
    grupo: "escritorio",
  },
  {
    href: "/integracoes",
    rotulo: "Integracoes",
    icone: "integracoes",
    soAdmin: true,
    grupo: "escritorio",
  },
  {
    href: "/conta",
    rotulo: "Minha conta",
    icone: "conta",
    grupo: "escritorio",
  },
];

const TITULO_DO_GRUPO: Record<Area["grupo"], string> = {
  trabalho: "Trabalho",
  dinheiro: "Dinheiro",
  escritorio: "Escritorio",
};

/**
 * A estrutura de toda tela de dentro do sistema: menu lateral com a marca do
 * escritorio, barra de cima com busca, e o conteudo.
 *
 * As duas camadas de permissao do menu continuam iguais: area de modulo nao
 * contratado nao aparece para escritorio nenhum, e area de admin nao aparece
 * para quem nao e admin. Some do menu e, na rota, responde 403 — as duas
 * coisas, nunca so uma.
 */
export function Estrutura({
  nomeEscritorio,
  logoUrl,
  papel,
  modulos,
  titulo,
  chamada,
  acao,
  termoDeBusca,
  largura = "larga",
  children,
}: {
  nomeEscritorio: string;
  logoUrl?: string | null;
  papel: string;
  modulos: Modulo[];
  titulo: string;
  chamada?: string;
  /** Botao principal da tela, no canto direito do cabecalho. */
  acao?: React.ReactNode;
  termoDeBusca?: string;
  largura?: "larga" | "estreita";
  children: React.ReactNode;
}) {
  const contratados = new Set(modulos);
  const areas = AREAS.filter(
    (area) =>
      (!area.modulo || contratados.has(area.modulo)) &&
      (!area.soAdmin || papel === "ADMIN"),
  );

  const grupos = (["trabalho", "dinheiro", "escritorio"] as const)
    .map((grupo) => ({
      grupo,
      titulo: TITULO_DO_GRUPO[grupo],
      areas: areas.filter((area) => area.grupo === grupo),
    }))
    .filter((bloco) => bloco.areas.length > 0);

  const marca = (
    <Link href="/" className="flex items-center gap-3 px-2 py-1">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={nomeEscritorio}
          className="h-8 w-auto max-w-[9rem] object-contain"
        />
      ) : (
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold"
          style={{
            backgroundColor: "var(--marca-primaria)",
            color: "var(--marca-contraste)",
          }}
        >
          {nomeEscritorio.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 truncate font-semibold text-slate-900">
        {nomeEscritorio}
      </span>
    </Link>
  );

  return (
    <div className="min-h-dvh lg:flex">
      <MenuLateral marca={marca} grupos={grupos} />

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-10 hidden border-b border-slate-200 bg-white/90 backdrop-blur lg:block">
          <div className="flex items-center gap-4 px-6 py-3">
            <CampoDeBusca termoInicial={termoDeBusca} />
            <div className="ml-auto flex items-center gap-2">
              <span className="etiqueta-neutra">{papel.toLowerCase()}</span>
              <Sair />
            </div>
          </div>
        </div>

        <main className={largura === "estreita" ? "pagina-estreita" : "pagina"}>
          <div className="cabecalho-da-pagina">
            <div className="min-w-0">
              <h1>{titulo}</h1>
              {chamada ? <p className="chamada">{chamada}</p> : null}
            </div>
            {acao ? <div className="shrink-0">{acao}</div> : null}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
