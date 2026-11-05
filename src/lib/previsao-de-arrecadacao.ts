// Previsao de arrecadacao: a leitura do Asaas e do banco. A conta (e o porque
// de cada fonte) esta em previsao-conta.ts.
import { comEscritorio } from "./prisma";
import { chamarAsaas, chaveDoEscritorio, paraCentavosDoAsaas } from "./cobrancas";
import {
  MESES_NA_PREVISAO,
  MESES_POR_CICLO,
  competenciaSeguinte,
  montarPrevisao,
  type AssinaturaLida,
  type PagamentoLido,
  type Previsao,
} from "./previsao-conta";

export { competenciaSeguinte };

const FUSO = "America/Sao_Paulo";
const VALIDADE_DO_CACHE_MS = 5 * 60 * 1000;

/**
 * Cache em processo por escritorio: a tela e das mais abertas, e paginar o
 * Asaas a cada abertura passaria do tempo do proxy.
 */
const cache = new Map<string, { em: number; chave: string; pagamentos: PagamentoLido[]; assinaturas: AssinaturaLida[] }>();

export function esquecerAsaasDaPrevisao(escritorioId: string) {
  cache.delete(escritorioId);
}

const texto = (v: unknown) => (typeof v === "string" ? v : "");

async function lerAsaas(escritorioId: string, chave: string, de: string, ate: string) {
  const guardado = cache.get(escritorioId);
  const marca = `${de}:${ate}`;
  if (guardado && guardado.chave === marca && Date.now() - guardado.em < VALIDADE_DO_CACHE_MS) return guardado;
  const pagamentos: PagamentoLido[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const pagina = await chamarAsaas(chave, `/payments?dueDate%5Bge%5D=${de}&dueDate%5Ble%5D=${ate}&offset=${offset}&limit=100`);
    for (const p of (Array.isArray(pagina.data) ? pagina.data : []) as Record<string, unknown>[]) {
      if (p.deleted === true) continue;
      pagamentos.push({
        id: texto(p.id),
        customer: texto(p.customer),
        valorCentavos: paraCentavosDoAsaas(p.value) ?? 0,
        vencimento: texto(p.dueDate).slice(0, 10),
        status: texto(p.status) || null,
        descricao: texto(p.description).trim(),
        assinatura: texto(p.subscription) || null,
        parcelamento: texto(p.installment) || null,
      });
    }
    if (!pagina.hasMore) break;
  }
  const assinaturas: AssinaturaLida[] = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const pagina = await chamarAsaas(chave, `/subscriptions?status=ACTIVE&offset=${offset}&limit=100`);
    for (const a of (Array.isArray(pagina.data) ? pagina.data : []) as Record<string, unknown>[]) {
      if (a.deleted === true) continue;
      assinaturas.push({
        id: texto(a.id),
        customer: texto(a.customer),
        valorCentavos: paraCentavosDoAsaas(a.value) ?? 0,
        proximoVencimento: texto(a.nextDueDate).slice(0, 10),
        cicloMeses: MESES_POR_CICLO[texto(a.cycle)] ?? null,
        descricao: texto(a.description).trim(),
      });
    }
    if (!pagina.hasMore) break;
  }
  const lido = { em: Date.now(), chave: marca, pagamentos, assinaturas };
  cache.set(escritorioId, lido);
  return lido;
}

export function hojeEmBrasilia(agora = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: FUSO });
}

export async function previsaoDeArrecadacao(escritorioId: string, inicio: string, agora = new Date()): Promise<Previsao> {
  const fim = competenciaSeguinte(inicio, MESES_NA_PREVISAO);
  const de = `${inicio}-01`;
  const ate = new Date(Date.UTC(Number(fim.slice(0, 4)), Number(fim.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10);
  const [locais, clientes, mensalidades] = await comEscritorio(escritorioId, (db) =>
    Promise.all([
      db.cobranca.findMany({
        where: { vencimento: { gte: new Date(`${de}T00:00:00Z`), lte: new Date(`${ate}T23:59:59Z`) } },
        select: {
          id: true,
          idNoProvedor: true,
          provedor: true,
          descricao: true,
          valorCentavos: true,
          valorPagoCentavos: true,
          vencimento: true,
          status: true,
          contratoId: true,
          mensalidadeId: true,
          parcelamentoId: true,
          cliente: { select: { nome: true } },
          baixas: { select: { valorCentavos: true } },
        },
      }),
      db.cliente.findMany({ where: { idNoAsaas: { not: null } }, select: { nome: true, idNoAsaas: true } }),
      db.mensalidade.findMany({ select: { idNoProvedor: true } }),
    ]),
  );
  let semAsaas = false;
  let erroDoAsaas: string | null = null;
  let pagamentos: PagamentoLido[] = [];
  let assinaturas: AssinaturaLida[] = [];
  let chave: string | null = null;
  try {
    chave = await chaveDoEscritorio(escritorioId);
  } catch {
    semAsaas = true;
  }
  if (chave) {
    try {
      ({ pagamentos, assinaturas } = await lerAsaas(escritorioId, chave, de, ate));
    } catch (erro) {
      erroDoAsaas = erro instanceof Error ? erro.message : "O Asaas não respondeu.";
    }
  }
  const r = montarPrevisao(
    {
      pagamentos,
      assinaturas,
      locais: locais.map((c) => ({
        id: c.id,
        idNoProvedor: c.idNoProvedor,
        provedor: c.provedor,
        cliente: c.cliente?.nome ?? "Sem cliente",
        descricao: c.descricao ?? "Cobrança",
        valorCentavos: c.valorCentavos,
        recebidoCentavos: c.valorPagoCentavos ?? c.baixas.reduce((t, b) => t + b.valorCentavos, 0),
        vencimento: c.vencimento.toISOString().slice(0, 10),
        status: c.status,
        contrato: Boolean(c.contratoId),
        mensalidade: Boolean(c.mensalidadeId),
        parcelamento: Boolean(c.parcelamentoId),
      })),
      nomePorConta: new Map(clientes.map((c) => [c.idNoAsaas!, c.nome])),
      assinaturasAqui: new Set(mensalidades.map((m) => m.idNoProvedor)),
      // Sem conta Asaas, o que ha aqui e tudo: entra como se o Asaas estivesse fora.
      erroDoAsaas: erroDoAsaas ?? (semAsaas ? "sem-asaas" : null),
    },
    inicio,
    MESES_NA_PREVISAO,
    hojeEmBrasilia(agora),
  );
  return { ...r, erroDoAsaas, semAsaas };
}
