// Areas do sistema, e quem o escritorio deixa entrar em cada uma.
//
// Esta e a TERCEIRA camada, e as tres precisam permitir:
//
//   modulo  — o escritorio contratou? (src/lib/modulos.ts)
//   papel   — a pessoa e admin, advogado ou usuario? (src/lib/papeis.ts)
//   area    — este escritorio deixa ESTA pessoa entrar aqui? (este arquivo)
//
// O papel diz o que a pessoa e; a area diz o que este escritorio decidiu para
// ela. Sao coisas diferentes: em uma banca a secretaria lanca cobranca, em
// outra nem ve o financeiro, e as duas tem secretaria.
//
// Nada aqui toca banco.
import type { Modulo } from "./modulos";
import type { Papel } from "./papeis";

export type Area = {
  chave: string;
  nome: string;
  /**
   * O que vale para quem NUNCA teve permissao gravada.
   *
   * Quase tudo nasce ABERTO, de proposito: ninguem pode perder acesso ao que
   * ja usava no dia a dia so porque o escritorio passou a ter um painel de
   * permissoes. Ligar o recurso nao pode mudar o trabalho de ninguem.
   */
  padrao: boolean;
  /** Sem o modulo contratado, a area nem existe para o escritorio. */
  modulo?: Modulo;
  /** Papel minimo. A permissao de area refina, nunca amplia. */
  soAdmin?: boolean;
};

export const AREAS: Area[] = [
  { chave: "CLIENTES", nome: "Clientes", padrao: true },
  { chave: "PROCESSOS", nome: "Processos", padrao: true },
  { chave: "AGENDA", nome: "Agenda", padrao: true },
  { chave: "PRAZOS", nome: "Prazos", padrao: true },
  { chave: "TAREFAS", nome: "Tarefas e metas", padrao: true },
  { chave: "PUBLICACOES", nome: "Publicacoes", padrao: true, modulo: "PUBLICACOES_DJEN" },
  { chave: "ARQUIVOS", nome: "Arquivos", padrao: true, modulo: "NUVEM" },
  { chave: "MODELOS", nome: "Modelos de documento", padrao: true },
  // Sem modulo de proposito: anotar a conversa e seguir um roteiro funciona
  // sem IA nenhuma. O que depende do modulo e a SUGESTAO do roteiro e a
  // organizacao do que foi dito, e cada uma se vira sozinha quando falta.
  { chave: "ENTREVISTAS", nome: "Entrevistas de triagem", padrao: true },

  // O DINHEIRO E SUBDIVIDIDO DE PROPOSITO. Da para liberar a emissao e a
  // conferencia de cobranca — o trabalho de quem atende o cliente — sem abrir
  // o livro-caixa, as despesas do escritorio e a meta do ano, que e o retrato
  // de quanto a banca ganha. Sao perguntas diferentes, e juntar as duas
  // obrigaria o escritorio a escolher entre travar o atendimento e mostrar o
  // proprio faturamento.
  //
  // Tudo aqui nasce FECHADO: e dinheiro de verdade, e exige alguem dizer sim.
  { chave: "COBRANCAS", nome: "Cobrancas e honorarios", padrao: false, modulo: "COBRANCAS" },
  { chave: "CONCILIACAO", nome: "Conferir o extrato", padrao: false, modulo: "COBRANCAS" },
  { chave: "FINANCEIRO", nome: "Financeiro (livro-caixa, despesas, metas)", padrao: false, modulo: "FINANCEIRO" },
  { chave: "NOTAS", nome: "Notas fiscais", padrao: false, modulo: "NFSE" },

  // Mexer em quem entra, em credencial e no cadastro do escritorio e do dono
  // da banca. Area so para constar: o papel ja basta, e a permissao nao
  // amplia.
  { chave: "USUARIOS", nome: "Usuarios", padrao: false, soAdmin: true },
  { chave: "INTEGRACOES", nome: "Integracoes", padrao: false, soAdmin: true },
  { chave: "ADMINISTRACAO", nome: "Administracao do escritorio", padrao: false, soAdmin: true },
];

export const CHAVES = new Set(AREAS.map((a) => a.chave));

export function ehArea(valor: string): boolean {
  return CHAVES.has(valor);
}

export function areaPorChave(chave: string): Area | null {
  return AREAS.find((a) => a.chave === chave) ?? null;
}

/** Onde cada endereco mora. O que nao esta aqui nao e controlado por area. */
export const AREA_DO_ENDERECO: Record<string, string> = {
  "/clientes": "CLIENTES",
  "/processos": "PROCESSOS",
  "/agenda": "AGENDA",
  "/prazos": "PRAZOS",
  "/tarefas": "TAREFAS",
  "/publicacoes": "PUBLICACOES",
  "/arquivos": "ARQUIVOS",
  "/modelos": "MODELOS",
  "/entrevistas": "ENTREVISTAS",
  "/cobrancas": "COBRANCAS",
  "/honorarios": "COBRANCAS",
  "/conciliacao": "CONCILIACAO",
  "/financeiro": "FINANCEIRO",
  "/notas": "NOTAS",
  "/usuarios": "USUARIOS",
  "/integracoes": "INTEGRACOES",
  "/administracao": "ADMINISTRACAO",
};

export type Gravada = { area: string; permitido: boolean };

/**
 * O que esta pessoa pode ver, area por area.
 *
 * ADMIN VE TUDO, e nao e atalho: quem administra o escritorio precisa poder
 * consertar o que quebrou em qualquer area, inclusive a permissao que alguem
 * se deu por engano. Um admin trancado fora do proprio sistema nao tem a quem
 * recorrer.
 *
 * A permissao de area so RESTRINGE. Area marcada "so admin" nao se abre para
 * quem nao e admin nem com registro gravado: a tela de permissoes nao pode
 * virar um caminho para promover alguem.
 */
export function mapaDeAcesso(
  papel: Papel,
  gravadas: Gravada[],
  modulos: Modulo[] = [],
): Record<string, boolean> {
  const mapa: Record<string, boolean> = {};
  const porArea = new Map(gravadas.map((g) => [g.area, g.permitido]));
  const temModulo = (m?: Modulo) => !m || modulos.includes(m);

  for (const a of AREAS) {
    if (!temModulo(a.modulo)) {
      // Sem modulo a area nem existe: mostrar como "bloqueada" faria o
      // escritorio procurar uma permissao que nao e o problema.
      mapa[a.chave] = false;
      continue;
    }
    if (papel === "ADMIN") {
      mapa[a.chave] = true;
      continue;
    }
    if (a.soAdmin) {
      mapa[a.chave] = false;
      continue;
    }
    mapa[a.chave] = porArea.has(a.chave) ? porArea.get(a.chave)! : a.padrao;
  }
  return mapa;
}

export function podeNaArea(
  papel: Papel,
  gravadas: Gravada[],
  modulos: Modulo[],
  area: string,
): boolean {
  return mapaDeAcesso(papel, gravadas, modulos)[area] === true;
}

/** As areas que o escritorio pode distribuir, sem as que so o admin ve. */
export function areasDistribuiveis(modulos: Modulo[]): Area[] {
  return AREAS.filter((a) => !a.soAdmin && (!a.modulo || modulos.includes(a.modulo)));
}
