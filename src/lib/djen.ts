// Cliente do DJEN (Diario de Justica Eletronico Nacional, API Comunica do CNJ).
//
// DOIS PONTOS QUE PRECISAM DE CONFERENCIA ANTES DO PILOTO:
//
// 1. A API bloqueia por pais (CloudFront). De fora do Brasil a resposta e 403,
//    entao o trabalhador da fila precisa rodar em infraestrutura brasileira —
//    e o que o plano ja previa como "rele no Brasil", agora confirmado.
// 2. O mapeamento de campos abaixo foi escrito a partir da documentacao, sem
//    poder bater contra uma resposta real daqui. Rode `npm run conferir-djen`
//    a partir do Brasil: ele busca uma pagina de verdade e mostra o que caiu em
//    cada campo. Enquanto isso nao for feito, trate o mapeamento como suspeito.
//
// Todo o resto do modulo depende so do tipo `Comunicacao`, entao um ajuste de
// mapeamento fica contido neste arquivo.
import { buscarComLimite, descreverFalha } from "./conectores/tipos";

export type Comunicacao = {
  idExterno: string;
  numeroProcesso: string | null;
  tribunal: string | null;
  orgao: string | null;
  tipoComunicacao: string | null;
  texto: string;
  link: string | null;
  dataDisponibilizacao: Date;
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
  const texto = primeiro(item, ["texto", "conteudo"]);
  const id = primeiro(item, ["id", "hash", "idComunicacao"]);
  const data = primeiro(item, ["data_disponibilizacao", "dataDisponibilizacao"]);
  if (!id || !texto || !data) return null;

  const quando = new Date(String(data));
  if (Number.isNaN(quando.getTime())) return null;

  return {
    idExterno: String(id),
    numeroProcesso:
      primeiro(item, ["numero_processo", "numeroProcesso", "numeroprocessocommascara"]) ?? null,
    tribunal: primeiro(item, ["siglaTribunal", "sigla_tribunal"]) ?? null,
    orgao: primeiro(item, ["nomeOrgao", "nome_orgao"]) ?? null,
    tipoComunicacao: primeiro(item, ["tipoComunicacao", "tipo_comunicacao"]) ?? null,
    texto: String(texto),
    link: primeiro(item, ["link"]) ?? null,
    dataDisponibilizacao: quando,
  };
}

function primeiro(item: Record<string, unknown>, chaves: string[]): string | null {
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
}> {
  const parametros = new URLSearchParams({
    numeroOab: consulta.numeroOab,
    ufOab: consulta.ufOab,
    dataDisponibilizacaoInicio: comoData(consulta.de),
    dataDisponibilizacaoFim: comoData(consulta.ate),
    pagina: String(consulta.pagina ?? 1),
    itensPorPagina: String(consulta.itensPorPagina ?? 100),
  });

  let resposta: Response;
  try {
    resposta = await buscarComLimite(`${baseDjen()}/comunicacao?${parametros}`, {
      headers: { Accept: "application/json" },
    });
  } catch (erro) {
    throw new FalhaNoDjen(descreverFalha(erro));
  }

  if (resposta.status === 403) {
    throw new FalhaNoDjen(
      "O DJEN recusou a consulta (403). A API bloqueia acesso de fora do Brasil: confira de onde o trabalhador esta rodando."
    );
  }
  if (!resposta.ok) throw new FalhaNoDjen(`O DJEN respondeu ${resposta.status}.`);

  const corpo = (await resposta.json().catch(() => null)) as
    | { items?: unknown[]; count?: number }
    | null;
  if (!corpo || !Array.isArray(corpo.items)) {
    throw new FalhaNoDjen("Resposta do DJEN sem a lista de comunicacoes.");
  }

  const comunicacoes = corpo.items
    .map((item) => converter(item as Record<string, unknown>))
    .filter((c): c is Comunicacao => c !== null);

  return { comunicacoes, total: corpo.count ?? comunicacoes.length };
}

/** Percorre as paginas ate acabar. Para em 20 paginas, por seguranca. */
export async function buscarPeriodo(consulta: ConsultaDjen): Promise<Comunicacao[]> {
  const porPagina = consulta.itensPorPagina ?? 100;
  const todas: Comunicacao[] = [];

  for (let pagina = 1; pagina <= 20; pagina += 1) {
    const { comunicacoes, total } = await buscarPagina({ ...consulta, pagina, itensPorPagina: porPagina });
    todas.push(...comunicacoes);
    if (comunicacoes.length === 0 || todas.length >= total) break;
  }
  return todas;
}
