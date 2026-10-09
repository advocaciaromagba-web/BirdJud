import Link from "next/link";
import type { Modulo } from "@/lib/modulos";
import { AREA_DO_ENDERECO } from "@/lib/areas";
import { Icone, type NomeDeIcone } from "./Icone";
import { MenuLateral } from "./MenuLateral";
import { CampoDeBusca } from "./CampoDeBusca";

export type Area = {
  href: string;
  rotulo: string;
  icone: NomeDeIcone;
  modulo?: Modulo;
  soAdmin?: boolean;
  /** Fica abaixo da linha, junto de Configuracoes. */
  rodape?: boolean;
};

/**
 * O menu, numa lista so.
 *
 * A ORDEM e o que organiza, no lugar dos titulos de grupo que havia antes.
 * De cima para baixo: o que se abre todo dia, depois o dinheiro, depois o
 * que se mexe uma vez por mes. Agrupar em "Trabalho / Dinheiro / Escritorio"
 * obrigava a pessoa a classificar antes de achar — "conferir extrato e
 * dinheiro ou escritorio?" — e custava tres cabecalhos de espaco.
 *
 * Os nomes seguem o que o escritorio ja chama assim: Inicio (nao "Painel"),
 * Equipe (nao "Usuarios").
 */
const AREAS: Area[] = [
  { href: "/", rotulo: "Inicio", icone: "painel" },
  { href: "/agenda", rotulo: "Agenda", icone: "agenda" },
  { href: "/tarefas", rotulo: "Tarefas", icone: "tarefas" },
  { href: "/prazos", rotulo: "Prazos", icone: "prazos" },
  { href: "/processos", rotulo: "Processos", icone: "processos" },
  { href: "/entrevistas", rotulo: "Entrevistas", icone: "entrevistas" },
  { href: "/clientes", rotulo: "Clientes", icone: "clientes" },
  {
    href: "/publicacoes",
    rotulo: "Publicacoes",
    icone: "publicacoes",
    modulo: "PUBLICACOES_DJEN",
  },
  {
    href: "/cobrancas",
    rotulo: "Cobrancas",
    icone: "cobrancas",
    modulo: "COBRANCAS",
  },
  {
    href: "/honorarios",
    rotulo: "Honorarios",
    icone: "honorarios",
    modulo: "COBRANCAS",
  },
  {
    href: "/notas",
    rotulo: "Notas fiscais",
    icone: "notas",
    modulo: "NFSE",
  },
  {
    href: "/financeiro",
    rotulo: "Financeiro",
    icone: "financeiro",
    modulo: "FINANCEIRO",
  },
  {
    href: "/conciliacao",
    rotulo: "Conferir extrato",
    icone: "extrato",
    modulo: "COBRANCAS",
  },
  { href: "/modelos", rotulo: "Modelos", icone: "modelos" },
  { href: "/arquivos", rotulo: "Arquivos", icone: "arquivos", modulo: "NUVEM" },
  { href: "/usuarios", rotulo: "Equipe", icone: "usuarios", soAdmin: true },

  // Abaixo da linha: o que nao e trabalho do dia.
  {
    href: "/primeiros-passos",
    rotulo: "Primeiros passos",
    icone: "passos",
    soAdmin: true,
    rodape: true,
  },
  { href: "/conta", rotulo: "Minha conta", icone: "conta", rodape: true },
  {
    href: "/integracoes",
    rotulo: "Integracoes",
    icone: "integracoes",
    soAdmin: true,
    rodape: true,
  },
  {
    href: "/administracao",
    rotulo: "Configuracoes",
    icone: "configuracoes",
    soAdmin: true,
    rodape: true,
  },
];

/**
 * A estrutura de toda tela de dentro do sistema: menu lateral com a marca do
 * escritorio, barra de cima com busca, e o conteudo.
 *
 * TRES camadas de permissao, e sempre as tres: modulo nao contratado nao
 * aparece para escritorio nenhum; area de admin nao aparece para quem nao e
 * admin; e area que ESTE escritorio fechou para ESTA pessoa tambem nao
 * aparece (src/lib/areas.ts).
 *
 * Some do menu E, na rota, responde 403. As duas coisas, nunca so uma: menu
 * escondido e teatro — quem souber o endereco entra do mesmo jeito.
 */
export function Estrutura({
  nomeEscritorio,
  logoUrl,
  papel,
  nomeUsuario,
  modulos,
  acesso,
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
  /** Nome de quem esta logado, para o cartao no pe do menu. */
  nomeUsuario?: string;
  modulos: Modulo[];
  /**
   * Area -> pode entrar. Sem isto, o menu mostra o que o modulo e o papel
   * deixam — o comportamento de antes, para a tela que ainda nao passa o
   * mapa nao esconder nada por engano.
   */
  acesso?: Record<string, boolean>;
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
      (!area.soAdmin || papel === "ADMIN") &&
      (!acesso || !AREA_DO_ENDERECO[area.href] || acesso[AREA_DO_ENDERECO[area.href]] === true),
  );

  const itens = areas.filter((area) => !area.rodape);
  const rodape = areas.filter((area) => area.rodape);

  const marca = (
    <Link href="/" className="flex items-center gap-3">
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
    <div className="min-h-dvh bg-[color:var(--off-white)] lg:flex">
      <MenuLateral
        marca={marca}
        itens={itens}
        rodape={rodape}
        nomeUsuario={nomeUsuario ?? nomeEscritorio}
        papel={papel}
      />

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-10 hidden border-b border-slate-200/70 bg-white/75 backdrop-blur-md lg:block">
          {/* So a busca. O cargo e o Sair saiam daqui tambem, e repetidos
              do cartao no pe do menu: duas saidas na mesma tela e uma a
              mais para a pessoa conferir qual e a certa. */}
          <div className="flex items-center gap-4 px-6 py-2.5">
            <CampoDeBusca termoInicial={termoDeBusca} />
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
