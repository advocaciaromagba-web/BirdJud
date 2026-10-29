/**
 * O pouco da API do Railway que o sistema precisa chamar sozinho.
 *
 * So leitura de deploys e volta para um deploy anterior. Nada de criar
 * servico, mexer em variavel ou apagar coisa: quanto menos este modulo
 * souber fazer, menor o estrago se ele for usado errado.
 *
 * O token e de PROJETO, nao de conta. Um token de conta abriria todos os
 * projetos do Railway para um processo cuja unica necessidade e ler deploys
 * de um servico e voltar um deles. Token de projeto nao usa
 * "Authorization: Bearer" — a API responde "Not Authorized" nesse cabecalho
 * e so aceita "Project-Access-Token".
 */
import type { EstadoDeDeploy } from "./volta-de-deploy";

const ENDERECO = "https://backboard.railway.app/graphql/v2";

export class RailwayMalConfigurado extends Error {
  constructor(motivo: string) {
    super(`Railway: ${motivo}`);
    this.name = "RailwayMalConfigurado";
  }
}

export type Acesso = {
  token: string;
  projetoId: string;
  ambienteId: string;
  servicoId: string;
};

const VARIAVEIS: Array<[keyof Acesso, string]> = [
  ["token", "RAILWAY_TOKEN_GUARDA"],
  ["projetoId", "RAILWAY_PROJETO_ID"],
  ["ambienteId", "RAILWAY_AMBIENTE_ID"],
  ["servicoId", "RAILWAY_SERVICO_APP_ID"],
];

/** Devolve null — e nao erro — quando nao esta configurado: a volta automatica e opcional. */
export function acessoDoAmbiente(
  ambiente: Record<string, string | undefined> = process.env,
): Acesso | null {
  const faltando = VARIAVEIS.filter(([, nome]) => !ambiente[nome]?.trim());
  if (faltando.length === VARIAVEIS.length) return null;
  if (faltando.length > 0) {
    throw new RailwayMalConfigurado(
      `faltam ${faltando.map(([, n]) => n).join(", ")}`,
    );
  }
  return Object.fromEntries(
    VARIAVEIS.map(([campo, nome]) => [campo, ambiente[nome]!.trim()]),
  ) as unknown as Acesso;
}

async function chamar(
  acesso: Acesso,
  consulta: string,
  variaveis: Record<string, unknown>,
): Promise<unknown> {
  const resposta = await fetch(ENDERECO, {
    method: "POST",
    headers: {
      "project-access-token": acesso.token,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query: consulta, variables: variaveis }),
    signal: AbortSignal.timeout(20_000),
  });
  const corpo = (await resposta.json()) as {
    data?: unknown;
    errors?: Array<{ message: string }>;
  };
  if (corpo.errors?.length) {
    throw new Error(corpo.errors.map((e) => e.message).join("; "));
  }
  return corpo.data;
}

const DEPLOYS = `
  query($p:String!,$e:String!,$s:String!){
    deployments(first:10,input:{projectId:$p,environmentId:$e,serviceId:$s}){
      edges{node{id status createdAt}}
    }
  }`;

export async function deploysRecentes(acesso: Acesso): Promise<EstadoDeDeploy[]> {
  const dados = (await chamar(acesso, DEPLOYS, {
    p: acesso.projetoId,
    e: acesso.ambienteId,
    s: acesso.servicoId,
  })) as { deployments: { edges: Array<{ node: Record<string, string> }> } };
  return dados.deployments.edges.map(({ node }) => ({
    id: node.id,
    situacao: node.status,
    criadoEm: node.createdAt,
  }));
}

const VOLTAR = `mutation($id:String!){ deploymentRollback(id:$id) }`;

export async function voltarPara(acesso: Acesso, deployId: string): Promise<void> {
  await chamar(acesso, VOLTAR, { id: deployId });
}

// ---------------------------------------------------------------------------
// Metricas dos servicos, para o painel de escalabilidade
//
// Le CPU, memoria, rede e disco de cada servico do ambiente. Os ids do projeto
// e do ambiente o proprio Railway poe no processo (RAILWAY_PROJECT_ID e
// RAILWAY_ENVIRONMENT_ID); o token e de projeto, como o da guarda — o mesmo
// serve. Sem token, o painel mostra o resto e diz o que falta.
// ---------------------------------------------------------------------------

export type AcessoAsMetricas = { token: string; projetoId: string; ambienteId: string };

export function acessoAsMetricas(
  ambiente: Record<string, string | undefined> = process.env,
): AcessoAsMetricas | null {
  const token = (ambiente.RAILWAY_TOKEN_METRICAS || ambiente.RAILWAY_TOKEN_GUARDA)?.trim();
  const projetoId = (ambiente.RAILWAY_PROJETO_ID || ambiente.RAILWAY_PROJECT_ID)?.trim();
  const ambienteId = (ambiente.RAILWAY_AMBIENTE_ID || ambiente.RAILWAY_ENVIRONMENT_ID)?.trim();
  if (!token || !projetoId || !ambienteId) return null;
  return { token, projetoId, ambienteId };
}

export const MEDIDAS = [
  "CPU_USAGE",
  "CPU_LIMIT",
  "MEMORY_USAGE_GB",
  "MEMORY_LIMIT_GB",
  "NETWORK_TX_GB",
  "DISK_USAGE_GB",
] as const;
export type Medida = (typeof MEDIDAS)[number];

export type SerieDoServico = {
  servicoId: string;
  medida: Medida;
  pontos: Array<{ ts: number; valor: number }>;
};

const METRICAS = `
  query($p:String!,$e:String!,$d:DateTime!,$t:Int!){
    metrics(projectId:$p,environmentId:$e,startDate:$d,sampleRateSeconds:$t,
            groupBy:[SERVICE_ID],measurements:[${MEDIDAS.join(",")}]){
      measurement tags{serviceId} values{ts value}
    }
  }`;

const SERVICOS = `query($p:String!){ project(id:$p){ services{ edges{ node{ id name } } } } }`;

export async function metricasDosServicos(
  acesso: AcessoAsMetricas,
  desde: Date,
  passoSegundos = 3600,
): Promise<{ series: SerieDoServico[]; nomes: Record<string, string> }> {
  const chave = { token: acesso.token, projetoId: acesso.projetoId, ambienteId: acesso.ambienteId, servicoId: "" };
  const [dados, projeto] = await Promise.all([
    chamar(chave, METRICAS, {
      p: acesso.projetoId,
      e: acesso.ambienteId,
      d: desde.toISOString(),
      t: passoSegundos,
    }) as Promise<{
      metrics: Array<{ measurement: Medida; tags: { serviceId: string | null }; values: Array<{ ts: number; value: number }> }>;
    }>,
    // O nome e so enfeite: sem permissao para ler o projeto, fica o id.
    (chamar(chave, SERVICOS, { p: acesso.projetoId }) as Promise<{
      project: { services: { edges: Array<{ node: { id: string; name: string } }> } };
    }>).catch(() => null),
  ]);
  const nomes = Object.fromEntries(
    (projeto?.project.services.edges ?? []).map(({ node }) => [node.id, node.name]),
  );
  const series = dados.metrics
    .filter((m) => m.tags.serviceId)
    .map((m) => ({
      servicoId: m.tags.serviceId!,
      medida: m.measurement,
      pontos: m.values.map((v) => ({ ts: v.ts, valor: v.value })),
    }));
  return { series, nomes };
}
