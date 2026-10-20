// Cliente do DJEN (Diario de Justica Eletronico Nacional, API Comunica do CNJ).
//
// A API bloqueia por pais (CloudFront): de fora do Brasil a resposta e 403.
// Quem resolve isso e o rele da Vercel (pasta rele/, fixado na regiao gru1).
// Com DJEN_RELE_URL configurado, toda consulta sai por ele e a aplicacao pode
// rodar onde quiser; sem ele, a consulta vai direto e so funciona do Brasil.
//
// A ABRANGENCIA E NACIONAL, e isto precisa ficar dito porque o nome do
// parametro engana: `ufOab` e o estado de INSCRICAO da OAB, nao um filtro de
// tribunal. Conferido contra o CNJ em 28/09/2026 — uma consulta com
// ufOab=BA devolveu TJBA, TJSP e TRF1 na mesma resposta.
//
// Por isso NAO ha filtro de tribunal em lugar nenhum daqui, e acrescentar um
// seria estreitar o que o escritorio recebe. Advogado com inscricao
// suplementar em mais de um estado tem uma OabMonitorada por inscricao, e
// cada uma ja traz o pais inteiro.
//
// O mapeamento de campos abaixo foi conferido contra resposta real do CNJ na
// mesma data (`npm run conferir-djen -- <oab> <uf>`, que sai pelo rele e por
// isso roda de qualquer lugar). Campo que sair vazio e mapeamento errado, e o
// lugar de corrigir e este arquivo.
//
// Todo o resto do modulo depende so do tipo `Comunicacao`, entao um ajuste de
// mapeamento fica contido aqui.
//
// LICOES DO SISTEMA DA ADVOCACIA ROMA, que usa o DJEN em producao:
//  1. o filtro por OAB da API NAO e confiavel (numero de OAB se repete entre
//     estados, e vem comunicacao de outro advogado junto). Toda comunicacao e
//     RECONFERIDA: so fica a que lista o advogado com o mesmo numero E UF;
//  2. o teto real e 50 itens por pagina — acima disso a API pode devolver
//     lista vazia SEM erro, parecendo "sem publicacao" quando havia;
//  3. ha limite de taxa (e 500 sob rajada): pagina a pagina, com pausa;
//  4. "datadisponibilizacao" vem em DD/MM/AAAA;
//  5. o texto as vezes vem em HTML cru — limparTextoHtml.
import { buscarComLimite, descreverFalha } from "./conectores/tipos";
import { limparTextoHtml } from "./limpar-html";

/** Parte da comunicacao (destinatario). `polo`: A ativo, P passivo. */
export type ParteDaComunicacao = { nome: string; polo: string | null };

export type Comunicacao = {
  idExterno: string;
  numeroProcesso: string | null;
  tribunal: string | null;
  orgao: string | null;
  tipoComunicacao: string | null;
  texto: string;
  link: string | null;
  dataDisponibilizacao: Date;
  /** Classe processual ("PROCEDIMENTO COMUM CIVEL"), quando vem. */
  classe?: string | null;
  /** As partes intimadas. Servem para achar o cliente do processo. */
  partes?: ParteDaComunicacao[];
  /** Advogados intimados: numero e UF da OAB, para reconferir o filtro. */
  advogados?: { numero: string; uf: string; nome: string | null }[];
};

export type ConsultaDjen = {
  numeroOab: string;
  ufOab: string;
  de: Date;
  ate: Date;
  pagina?: number;
  itensPorPagina?: number;
};

export function baseDjen(): string {
  return process.env.DJEN_BASE_URL ?? "https://comunicaapi.pje.jus.br/api/v1";
}

/** Endereco do rele brasileiro, ou null quando a consulta vai direto. */
export function releDjen(): string | null {
  const endereco = process.env.DJEN_RELE_URL?.trim();
  return endereco ? endereco.replace(/\/+$/, "") : null;
}

/**
 * Para onde a consulta vai e com que cabecalhos.
 *
 * O rele recebe os mesmos parametros que o DJEN receberia — ele confere um por
 * um do outro lado —, mais o token da plataforma. Sem rele, vai direto.
 */
export function destinoDaConsulta(parametros: URLSearchParams): {
  url: string;
  cabecalhos: Record<string, string>;
} {
  const cabecalhos: Record<string, string> = { Accept: "application/json" };
  const rele = releDjen();
  if (!rele)
    return { url: `${baseDjen()}/comunicacao?${parametros}`, cabecalhos };

  const token = process.env.DJEN_RELE_TOKEN?.trim();
  if (token) cabecalhos.Authorization = `Bearer ${token}`;
  return { url: `${rele}?${parametros}`, cabecalhos };
}

/** aaaa-mm-dd, que e o formato que a API espera. */
export function comoData(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/**
 * Converte um item cru da API no nosso tipo.
 *
 * A API mistura convencoes de nome (snake_case e camelCase) conforme o campo,
 * entao cada um aceita as duas formas documentadas. O que NAO se faz aqui e
 * adivinhar campo novo: item sem id ou sem texto e descartado pelo chamador.
 */
export function converter(item: Record<string, unknown>): Comunicacao | null {
  const textoCru = primeiro(item, ["texto", "conteudo"]);
  const texto = textoCru ? limparTextoHtml(textoCru) : null;
  const id = primeiro(item, ["id", "hash", "idComunicacao"]);
  const data = primeiro(item, [
    "data_disponibilizacao",
    "dataDisponibilizacao",
    "datadisponibilizacao",
  ]);
  if (!id || !texto || !data) return null;

  const quando = paraData(String(data));
  if (!quando) return null;

  const partes = (Array.isArray(item.destinatarios) ? item.destinatarios : [])
    .map((d: Record<string, unknown>) => ({
      nome: typeof d?.nome === "string" ? d.nome.trim() : "",
      polo: typeof d?.polo === "string" ? d.polo : null,
    }))
    .filter((p) => p.nome);
  const advogados = (Array.isArray(item.destinatarioadvogados) ? item.destinatarioadvogados : [])
    .map((d: Record<string, unknown>) => {
      const a = (d?.advogado ?? {}) as Record<string, unknown>;
      return {
        numero: String(a.numero_oab ?? "").replace(/\D/g, ""),
        uf: String(a.uf_oab ?? "").toUpperCase(),
        nome: typeof a.nome === "string" ? a.nome : null,
      };
    })
    .filter((a) => a.numero);

  return {
    idExterno: String(id),
    numeroProcesso:
      primeiro(item, [
        "numero_processo",
        "numeroProcesso",
        "numeroprocessocommascara",
      ]) ?? null,
    tribunal: primeiro(item, ["siglaTribunal", "sigla_tribunal"]) ?? null,
    orgao: primeiro(item, ["nomeOrgao", "nome_orgao"]) ?? null,
    tipoComunicacao:
      primeiro(item, ["tipoComunicacao", "tipo_comunicacao"]) ?? null,
    texto,
    link: primeiro(item, ["link"]) ?? null,
    dataDisponibilizacao: quando,
    classe: primeiro(item, ["nomeClasse", "nome_classe"]) ?? null,
    partes,
    advogados,
  };
}

/** ISO ("2026-09-14", "2026-09-14T...") ou brasileiro ("14/09/2026"). */
function paraData(texto: string): Date | null {
  const br = texto.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const quando = br ? new Date(`${br[3]}-${br[2]}-${br[1]}T12:00:00Z`) : new Date(texto);
  return Number.isNaN(quando.getTime()) ? null : quando;
}

/**
 * A comunicacao e mesmo desta OAB? A API devolve de outros advogados junto
 * (licao 1). Comunicacao sem a lista de advogados nao tem como ser conferida
 * e fica de fora — como no sistema da Roma.
 */
export function eDaOab(c: Comunicacao, numeroOab: string, ufOab: string): boolean {
  const numero = numeroOab.replace(/\D/g, "").replace(/^0+/, "");
  return (c.advogados ?? []).some((a) => a.numero.replace(/^0+/, "") === numero && a.uf === ufOab.toUpperCase());
}

const pausa = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
/** Teto real da API (licao 2). */
export const ITENS_POR_PAGINA = 50;

function primeiro(
  item: Record<string, unknown>,
  chaves: string[],
): string | null {
  for (const chave of chaves) {
    const valor = item[chave];
    if (typeof valor === "string" && valor.trim()) return valor.trim();
    if (typeof valor === "number") return String(valor);
  }
  return null;
}

export class FalhaNoDjen extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "FalhaNoDjen";
  }
}

/** Uma pagina de comunicacoes de uma OAB no periodo. */
export async function buscarPagina(consulta: ConsultaDjen): Promise<{
  comunicacoes: Comunicacao[];
  total: number;
  /** Itens que vieram na pagina, antes da reconferencia da OAB. */
  recebidos: number;
}> {
  const parametros = new URLSearchParams({
    numeroOab: consulta.numeroOab,
    ufOab: consulta.ufOab,
    dataDisponibilizacaoInicio: comoData(consulta.de),
    dataDisponibilizacaoFim: comoData(consulta.ate),
    pagina: String(consulta.pagina ?? 1),
    itensPorPagina: String(Math.min(consulta.itensPorPagina ?? ITENS_POR_PAGINA, ITENS_POR_PAGINA)),
  });

  const destino = destinoDaConsulta(parametros);

  let resposta: Response;
  try {
    resposta = await buscarComLimite(destino.url, {
      headers: destino.cabecalhos,
    });
  } catch (erro) {
    throw new FalhaNoDjen(descreverFalha(erro));
  }

  const peloRele = releDjen() !== null;

  if (resposta.status === 401 && peloRele) {
    throw new FalhaNoDjen(
      "O rele do DJEN recusou o token (401). Confira se DJEN_RELE_TOKEN é o mesmo RELE_TOKEN configurado na Vercel.",
    );
  }
  if (resposta.status === 403) {
    throw new FalhaNoDjen(
      peloRele
        ? "O DJEN recusou a consulta (403) mesmo pelo rele. Confira se o projeto do rele na Vercel está fixado na região gru1 (São Paulo)."
        : "O DJEN recusou a consulta (403). A API bloqueia acesso de fora do Brasil: configure DJEN_RELE_URL para sair pelo rele.",
    );
  }
  if (!resposta.ok)
    throw new FalhaNoDjen(`O DJEN respondeu ${resposta.status}.`);

  const corpo = (await resposta.json().catch(() => null)) as {
    items?: unknown[];
    count?: number;
  } | null;
  if (!corpo || !Array.isArray(corpo.items)) {
    throw new FalhaNoDjen("Resposta do DJEN sem a lista de comunicações.");
  }

  const recebidos = corpo.items.length;
  const comunicacoes = corpo.items
    .map((item) => converter(item as Record<string, unknown>))
    .filter((c): c is Comunicacao => c !== null)
    .filter((c) => eDaOab(c, consulta.numeroOab, consulta.ufOab));

  return { comunicacoes, total: corpo.count ?? recebidos, recebidos };
}

/**
 * Percorre as paginas ate acabar: pagina com menos que o teto e a ultima.
 * Para em 20 paginas (1.000 comunicacoes por janela), por seguranca, e pausa
 * entre paginas por causa do limite de taxa.
 */
export async function buscarPeriodo(
  consulta: ConsultaDjen,
  pausaMs = Number(process.env.DJEN_PAUSA_MS ?? 600),
): Promise<Comunicacao[]> {
  const porPagina = Math.min(consulta.itensPorPagina ?? ITENS_POR_PAGINA, ITENS_POR_PAGINA);
  const todas: Comunicacao[] = [];

  for (let pagina = 1; pagina <= 20; pagina += 1) {
    const { comunicacoes, recebidos } = await buscarPagina({
      ...consulta,
      pagina,
      itensPorPagina: porPagina,
    });
    todas.push(...comunicacoes);
    if (recebidos < porPagina) break;
    if (pausaMs > 0) await pausa(pausaMs);
  }
  return todas;
}
