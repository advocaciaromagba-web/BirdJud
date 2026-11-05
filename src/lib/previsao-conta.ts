// Previsao de arrecadacao mes a mes, lendo o Asaas (03/11/2026, vindo do
// sistema da Advocacia Roma).
//
// Trazer cobranca do Asaas para ca e ato deliberado (a conferencia), e o que
// ninguem trouxe nao existia para nenhuma previsao — a mensalidade criada
// direto no painel do Asaas sumia do mes. A PREVISAO nao depende mais disso:
// le o Asaas direto. Importar continua sendo escolha de quem cuida do dinheiro.
//
// Tres fontes, sem contar duas vezes:
// 1. cobrancas do Asaas — o que foi emitido e o que foi pago;
// 2. cobrancas que so existem aqui (InfinitePay) — nao tem par no Asaas;
// 3. assinaturas ativas que ainda NAO geraram a cobranca do mes, marcadas como
//    projetadas. Sem isso a mensalidade de dezembro valeria zero ate o Asaas
//    emitir, tarde demais para planejar.
//
// As quatro somas do mes (previsto, recebido, a vencer, vencido) olham o MESMO
// conjunto: o que VENCE no mes. Nao e caixa — o "recebido no mes" do livro
// inclui pagamento de cobranca que vencia antes; aqui nao.
// Este arquivo e a conta, sem rede nem banco: a tela (cliente) importa daqui.
// A leitura do Asaas e do banco mora em previsao-de-arrecadacao.ts.

/** Status do Asaas que querem dizer pago, e os que tiram a cobranca da conta. */
const PAGOS = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
const FORA = new Set(["REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL", "DELETED"]);

export const MESES_NA_PREVISAO = 6;

export type Origem = "MENSALIDADE" | "PARCELAMENTO" | "CONTRATO" | "AVULSA";
export const ROTULO_DA_ORIGEM: Record<Origem, string> = {
  MENSALIDADE: "Mensalidade (assinatura)",
  PARCELAMENTO: "Parcelamento",
  CONTRATO: "Contrato de honorários",
  AVULSA: "Cobrança avulsa",
};

export type LinhaDaPrevisao = {
  chave: string;
  cliente: string;
  descricao: string;
  valorCentavos: number;
  recebidoCentavos: number;
  vencimento: string;
  origem: Origem;
  fonte: "ASAAS" | "SISTEMA" | "PROJETADA";
  pago: boolean;
};

export type Fatia = { rotulo: string; centavos: number; quantas: number };

export type MesDaPrevisao = {
  competencia: string;
  previsto: number;
  recebido: number;
  aVencer: number;
  vencido: number;
  projetado: number;
  porOrigem: Fatia[];
  porCliente: Fatia[];
  linhas: LinhaDaPrevisao[];
};

export type Pendencia = { tipo: "ASSINATURA_FORA" | "PAGADOR_DESCONHECIDO" | "SO_NO_ASAAS"; texto: string; centavos: number | null };

export type Previsao = {
  meses: MesDaPrevisao[];
  pendencias: Pendencia[];
  /** Preenchido quando o Asaas nao respondeu: o numero esta incompleto. */
  erroDoAsaas: string | null;
  semAsaas: boolean;
};

// ---------------------------------------------------------------------------
// Entradas (o que se leu do Asaas e do banco), ja no formato que a conta usa
// ---------------------------------------------------------------------------

export type PagamentoLido = {
  id: string;
  customer: string;
  valorCentavos: number;
  vencimento: string;
  status: string | null;
  descricao: string;
  assinatura: string | null;
  parcelamento: string | null;
};

export type AssinaturaLida = {
  id: string;
  customer: string;
  valorCentavos: number;
  proximoVencimento: string;
  /** Em meses; nulo para ciclo semanal/quinzenal, que nao se projeta. */
  cicloMeses: number | null;
  descricao: string;
};

export type CobrancaLocal = {
  id: string;
  idNoProvedor: string | null;
  provedor: string;
  cliente: string;
  descricao: string;
  valorCentavos: number;
  recebidoCentavos: number;
  vencimento: string;
  status: string;
  contrato: boolean;
  mensalidade: boolean;
  parcelamento: boolean;
};

export type Entradas = {
  pagamentos: PagamentoLido[];
  assinaturas: AssinaturaLida[];
  locais: CobrancaLocal[];
  nomePorConta: Map<string, string>;
  assinaturasAqui: Set<string>;
  erroDoAsaas: string | null;
};

export const MESES_POR_CICLO: Record<string, number> = { MONTHLY: 1, BIMONTHLY: 2, QUARTERLY: 3, SEMIANNUALLY: 6, YEARLY: 12 };

export function competenciaSeguinte(c: string, passos = 1): string {
  const [a, m] = c.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + passos, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Soma meses a uma data aaaa-mm-dd, segurando o dia no fim do mes (31/01 + 1 = 28/02). */
export function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m - 1 + meses + 1, 0)).getUTCDate();
  const alvo = new Date(Date.UTC(a, m - 1 + meses, Math.min(d, ultimo)));
  return alvo.toISOString().slice(0, 10);
}

function somar(mapa: Map<string, Fatia>, rotulo: string, centavos: number) {
  const f = mapa.get(rotulo) ?? { rotulo, centavos: 0, quantas: 0 };
  f.centavos += centavos;
  f.quantas += 1;
  mapa.set(rotulo, f);
}

/** A conta, sem rede nem banco: o teste e a tela usam a mesma. */
export function montarPrevisao(e: Entradas, inicio: string, quantos: number, hoje: string): Omit<Previsao, "semAsaas"> {
  const competencias = Array.from({ length: quantos }, (_, i) => competenciaSeguinte(inicio, i));
  const fim = competenciaSeguinte(inicio, quantos);
  const noPeriodo = (venc: string) => venc.slice(0, 7) >= inicio && venc.slice(0, 7) < fim;
  const linhas: LinhaDaPrevisao[] = [];
  const pendencias: Pendencia[] = [];

  // 1. Asaas
  const locaisPorId = new Map(e.locais.filter((l) => l.idNoProvedor).map((l) => [l.idNoProvedor!, l]));
  const vivos = e.pagamentos.filter((p) => !FORA.has(p.status ?? ""));
  const idsVivos = new Set(vivos.map((p) => p.id));
  let semPagador = 0;
  let semPagadorCentavos = 0;
  let soNoAsaas = 0;
  let soNoAsaasCentavos = 0;
  // Assinatura x mes que ja tem cobranca emitida: nao se projeta de novo.
  const emitidas = new Set<string>();
  for (const p of vivos) {
    if (p.assinatura) emitidas.add(`${p.assinatura}:${p.vencimento.slice(0, 7)}`);
    if (!noPeriodo(p.vencimento)) continue;
    const local = locaisPorId.get(p.id);
    const nome = e.nomePorConta.get(p.customer) ?? local?.cliente ?? null;
    if (!nome) {
      semPagador += 1;
      semPagadorCentavos += p.valorCentavos;
    }
    if (!local) {
      soNoAsaas += 1;
      soNoAsaasCentavos += p.valorCentavos;
    }
    const pago = PAGOS.has(p.status ?? "");
    linhas.push({
      chave: `asaas:${p.id}`,
      cliente: nome ?? "Pagador fora do cadastro",
      descricao: p.descricao || local?.descricao || "Cobrança sem descrição",
      valorCentavos: p.valorCentavos,
      // Pagamento parcial so existe do lado de ca (baixa parcial).
      recebidoCentavos: pago ? p.valorCentavos : Math.min(local?.recebidoCentavos ?? 0, p.valorCentavos),
      vencimento: p.vencimento,
      origem: p.assinatura || local?.mensalidade ? "MENSALIDADE" : p.parcelamento || local?.parcelamento ? "PARCELAMENTO" : local?.contrato ? "CONTRATO" : "AVULSA",
      fonte: "ASAAS",
      pago,
    });
  }

  // 2. So daqui (e, com o Asaas fora do ar, tudo daqui: tela vazia justo
  // quando mais se precisa dela nao serve).
  for (const l of e.locais) {
    if (!noPeriodo(l.vencimento) || l.status === "CANCELADA" || l.status === "ESTORNADA") continue;
    if (l.provedor === "ASAAS" && !e.erroDoAsaas) continue;
    if (l.idNoProvedor && idsVivos.has(l.idNoProvedor)) continue;
    linhas.push({
      chave: `sistema:${l.id}`,
      cliente: l.cliente,
      descricao: l.descricao,
      valorCentavos: l.valorCentavos,
      recebidoCentavos: l.status === "PAGA" ? l.valorCentavos : l.recebidoCentavos,
      vencimento: l.vencimento,
      origem: l.mensalidade ? "MENSALIDADE" : l.parcelamento ? "PARCELAMENTO" : l.contrato ? "CONTRATO" : "AVULSA",
      fonte: "SISTEMA",
      pago: l.status === "PAGA",
    });
  }

  // 3. Assinaturas que ainda nao emitiram a cobranca do mes
  for (const a of e.assinaturas) {
    if (!e.assinaturasAqui.has(a.id)) {
      pendencias.push({
        tipo: "ASSINATURA_FORA",
        texto: `Assinatura no Asaas sem mensalidade aqui: ${e.nomePorConta.get(a.customer) ?? "pagador fora do cadastro"} — ${a.descricao || "sem descrição"}`,
        centavos: a.valorCentavos,
      });
    }
    if (!a.cicloMeses) continue;
    let venc = a.proximoVencimento;
    for (let i = 0; i < 60 && venc.slice(0, 7) < fim; i++, venc = somarMeses(a.proximoVencimento, a.cicloMeses * i)) {
      if (!noPeriodo(venc) || venc < hoje || emitidas.has(`${a.id}:${venc.slice(0, 7)}`)) continue;
      linhas.push({
        chave: `projetada:${a.id}:${venc}`,
        cliente: e.nomePorConta.get(a.customer) ?? "Pagador fora do cadastro",
        descricao: a.descricao || "Mensalidade",
        valorCentavos: a.valorCentavos,
        recebidoCentavos: 0,
        vencimento: venc,
        origem: "MENSALIDADE",
        fonte: "PROJETADA",
        pago: false,
      });
    }
  }

  if (semPagador) pendencias.push({ tipo: "PAGADOR_DESCONHECIDO", texto: `${semPagador} cobrança(s) de pagador fora do cadastro de clientes: entram no total, sem nome.`, centavos: semPagadorCentavos });
  if (soNoAsaas)
    pendencias.push({ tipo: "SO_NO_ASAAS", texto: `${soNoAsaas} cobrança(s) no Asaas que não estão no sistema. Entram aqui; para trazê-las, use Conferir com o Asaas em Cobranças.`, centavos: soNoAsaasCentavos });

  const meses = competencias.map((competencia): MesDaPrevisao => {
    const doMes = linhas.filter((l) => l.vencimento.slice(0, 7) === competencia).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const porOrigem = new Map<string, Fatia>();
    const porCliente = new Map<string, Fatia>();
    const m: MesDaPrevisao = { competencia, previsto: 0, recebido: 0, aVencer: 0, vencido: 0, projetado: 0, porOrigem: [], porCliente: [], linhas: doMes };
    for (const l of doMes) {
      m.previsto += l.valorCentavos;
      m.recebido += l.recebidoCentavos;
      const falta = l.valorCentavos - l.recebidoCentavos;
      if (falta > 0) {
        if (l.vencimento < hoje) m.vencido += falta;
        else m.aVencer += falta;
      }
      if (l.fonte === "PROJETADA") m.projetado += l.valorCentavos;
      somar(porOrigem, ROTULO_DA_ORIGEM[l.origem], l.valorCentavos);
      somar(porCliente, l.cliente, l.valorCentavos);
    }
    m.porOrigem = [...porOrigem.values()].sort((a, b) => b.centavos - a.centavos);
    m.porCliente = [...porCliente.values()].sort((a, b) => b.centavos - a.centavos);
    return m;
  });
  return { meses, pendencias, erroDoAsaas: e.erroDoAsaas };
}

