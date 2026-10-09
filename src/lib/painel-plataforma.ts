// O painel da plataforma: a carteira de escritorios da Blackbird em numeros.
//
// Funcao pura sobre o retrato do banco: recebe escritorios, assinaturas e
// faturas, devolve os numeros, os graficos prontos e a analise em texto. Sem
// banco aqui dentro — e assim que a conta de inadimplencia e de previsao tem
// teste, e nao so "parece certo na tela".
//
// DEFINICOES, porque cada numero de painel financeiro engana de um jeito:
//
//   receita mensal contratada  soma das assinaturas de quem PAGA: ativo e
//                              inadimplente. Inadimplente continua devendo a
//                              mensalidade; suspenso e encerrado, nao.
//   em teste                   assinatura ja fechada, ainda nao cobrada.
//   vencido                    fatura ABERTA com vencimento antes de hoje.
//   recebido                   fatura PAGA, pelo mes do pagamento (nao da
//                              competencia): e o dinheiro que entrou no mes.
//   previsao                   garantido = assinaturas pagantes, mes a mes;
//                              testes = quem sai do teste antes do vencimento
//                              daquele mes, SE assinar. Os dois separados,
//                              porque somar promessa com contrato e o jeito
//                              mais rapido de errar a previsao.
import { emReais } from "./dinheiro";

export const STATUS = ["ATIVO", "TESTE", "INADIMPLENTE", "SUSPENSO", "ENCERRADO"] as const;
export const ROTULO_DO_STATUS: Record<string, string> = {
  ATIVO: "Ativos",
  TESTE: "Em teste",
  INADIMPLENTE: "Inadimplentes",
  SUSPENSO: "Suspensos",
  ENCERRADO: "Encerrados",
};
export const ROTULO_DA_FAIXA: Record<string, string> = {
  ATE_1: "Solo",
  ATE_3: "Pequeno",
  ATE_10: "Escritorio",
  ATE_25: "Grande",
  ATE_50: "Corporativo",
};
export const FAIXAS_EM_ORDEM = ["ATE_1", "ATE_3", "ATE_10", "ATE_25", "ATE_50"] as const;
export const FAIXAS_DE_ATRASO = [
  { chave: "ATE_15", rotulo: "ate 15 dias", ate: 15 },
  { chave: "ATE_30", rotulo: "16 a 30 dias", ate: 30 },
  { chave: "ATE_60", rotulo: "31 a 60 dias", ate: 60 },
  { chave: "MAIS_60", rotulo: "mais de 60 dias", ate: Infinity },
] as const;

export type FaturaNoPainel = {
  competencia: string;
  valorCentavos: number;
  vencimento: Date;
  status: string;
  pagoEm: Date | null;
};

export type EscritorioNoPainel = {
  id: string;
  nome: string;
  status: string;
  faixa: string;
  criadoEm: Date;
  encerradoEm: Date | null;
  assinatura: { valorCentavos: number; diaVencimento: number; fimDoTeste: Date; canceladaEm: Date | null } | null;
  faturas: FaturaNoPainel[];
};

export type Fatia = { chave: string; rotulo: string; valor: number };
export type MesDePrevisao = { competencia: string; rotulo: string; garantido: number; testes: number };
export type MesRecebido = { competencia: string; rotulo: string; valor: number };

export type Analise = {
  escritorios: { total: number; porStatus: Fatia[] };
  receitaMensal: number;
  pagantes: number;
  ticketMedio: number;
  receitaEmTeste: number;
  porFaixa: Fatia[];
  vencido: { total: number; escritorios: number; porcentoDaReceita: number; porIdade: Fatia[]; maiorDevedor: { nome: string; valor: number; dias: number } | null };
  recebidoNoMes: number;
  recebidos: MesRecebido[];
  previsao: MesDePrevisao[];
  testesAcabando: { nome: string; fimDoTeste: Date; valor: number }[];
  concentracao: { nome: string; porcento: number } | null;
  textos: string[];
};

const DIA = 24 * 60 * 60 * 1000;
const PAGAM = new Set(["ATIVO", "INADIMPLENTE"]);
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-10" no fuso de Brasilia. */
export function competenciaDe(data: Date): string {
  const [a, m] = data.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).split("-");
  return `${a}-${m}`;
}

export function somarMeses(competencia: string, n: number): string {
  const [a, m] = competencia.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function rotuloDoMes(competencia: string): string {
  const [a, m] = competencia.split("-").map(Number);
  return `${MESES[m - 1]}/${String(a).slice(2)}`;
}

/** Vencimento da assinatura naquele mes: o dia contratado, sem passar do fim do mes. */
function vencimentoNoMes(competencia: string, dia: number): Date {
  const [a, m] = competencia.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return new Date(Date.UTC(a, m - 1, Math.min(dia, ultimo), 15));
}

const porcento = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 1000) / 10 : 0);

export function analisarCarteira(escritorios: EscritorioNoPainel[], agora = new Date(), meses = 6): Analise {
  const vivos = escritorios.filter((e) => e.status !== "ENCERRADO");

  const porStatus = STATUS.map((s) => ({
    chave: s,
    rotulo: ROTULO_DO_STATUS[s],
    valor: escritorios.filter((e) => e.status === s).length,
  }));

  const pagantes = escritorios.filter((e) => PAGAM.has(e.status) && e.assinatura && !e.assinatura.canceladaEm);
  const receitaMensal = pagantes.reduce((s, e) => s + e.assinatura!.valorCentavos, 0);
  const emTeste = escritorios.filter((e) => e.status === "TESTE" && e.assinatura && !e.assinatura.canceladaEm);
  const receitaEmTeste = emTeste.reduce((s, e) => s + e.assinatura!.valorCentavos, 0);

  const porFaixa = FAIXAS_EM_ORDEM.map((f) => ({
    chave: f,
    rotulo: ROTULO_DA_FAIXA[f],
    valor: pagantes.filter((e) => e.faixa === f).reduce((s, e) => s + e.assinatura!.valorCentavos, 0),
  }));

  // ---------------------------------------------------------- vencido
  const idade = new Map<string, number>(FAIXAS_DE_ATRASO.map((f) => [f.chave, 0]));
  let vencidoTotal = 0;
  const devedores = new Map<string, { nome: string; valor: number; dias: number }>();
  for (const e of escritorios) {
    for (const f of e.faturas) {
      if (f.status !== "ABERTA" || f.vencimento.getTime() >= agora.getTime()) continue;
      const dias = Math.max(1, Math.floor((agora.getTime() - f.vencimento.getTime()) / DIA));
      const faixa = FAIXAS_DE_ATRASO.find((x) => dias <= x.ate)!;
      idade.set(faixa.chave, idade.get(faixa.chave)! + f.valorCentavos);
      vencidoTotal += f.valorCentavos;
      const d = devedores.get(e.id) ?? { nome: e.nome, valor: 0, dias: 0 };
      d.valor += f.valorCentavos;
      d.dias = Math.max(d.dias, dias);
      devedores.set(e.id, d);
    }
  }
  const maiorDevedor = [...devedores.values()].sort((a, b) => b.valor - a.valor)[0] ?? null;

  // ---------------------------------------------------------- recebido
  const atual = competenciaDe(agora);
  const recebidos: MesRecebido[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const c = somarMeses(atual, -i);
    recebidos.push({ competencia: c, rotulo: rotuloDoMes(c), valor: 0 });
  }
  const indiceRecebido = new Map(recebidos.map((r, i) => [r.competencia, i]));
  for (const e of escritorios) {
    for (const f of e.faturas) {
      if (f.status !== "PAGA" || !f.pagoEm) continue;
      const i = indiceRecebido.get(competenciaDe(f.pagoEm));
      if (i !== undefined) recebidos[i].valor += f.valorCentavos;
    }
  }

  // ---------------------------------------------------------- previsao
  const previsao: MesDePrevisao[] = [];
  for (let i = 1; i <= meses; i++) {
    const c = somarMeses(atual, i);
    let garantido = 0;
    let testes = 0;
    for (const e of pagantes) garantido += e.assinatura!.valorCentavos;
    for (const e of emTeste) {
      const a = e.assinatura!;
      if (a.fimDoTeste.getTime() <= vencimentoNoMes(c, a.diaVencimento).getTime()) testes += a.valorCentavos;
    }
    previsao.push({ competencia: c, rotulo: rotuloDoMes(c), garantido, testes });
  }

  const testesAcabando = emTeste
    .filter((e) => {
      const falta = e.assinatura!.fimDoTeste.getTime() - agora.getTime();
      return falta >= 0 && falta <= 7 * DIA;
    })
    .map((e) => ({ nome: e.nome, fimDoTeste: e.assinatura!.fimDoTeste, valor: e.assinatura!.valorCentavos }))
    .sort((a, b) => a.fimDoTeste.getTime() - b.fimDoTeste.getTime());

  const maior = [...pagantes].sort((a, b) => b.assinatura!.valorCentavos - a.assinatura!.valorCentavos)[0];
  const concentracao =
    maior && pagantes.length > 1
      ? { nome: maior.nome, porcento: porcento(maior.assinatura!.valorCentavos, receitaMensal) }
      : null;

  const recebidoNoMes = recebidos[recebidos.length - 1].valor;
  const r: Analise = {
    escritorios: { total: vivos.length, porStatus },
    receitaMensal,
    pagantes: pagantes.length,
    ticketMedio: pagantes.length ? Math.round(receitaMensal / pagantes.length) : 0,
    receitaEmTeste,
    porFaixa,
    vencido: {
      total: vencidoTotal,
      escritorios: devedores.size,
      porcentoDaReceita: porcento(vencidoTotal, receitaMensal),
      porIdade: FAIXAS_DE_ATRASO.map((f) => ({ chave: f.chave, rotulo: f.rotulo, valor: idade.get(f.chave)! })),
      maiorDevedor,
    },
    recebidoNoMes,
    recebidos,
    previsao,
    testesAcabando,
    concentracao,
    textos: [],
  };
  r.textos = escreverAnalise(r);
  return r;
}

/**
 * A analise em portugues. Uma frase por fato, e so os fatos que pedem
 * atencao ou decisao — painel que comenta tudo ensina a nao ler.
 */
export function escreverAnalise(a: Analise): string[] {
  const t: string[] = [];

  if (a.pagantes === 0) {
    t.push(
      a.receitaEmTeste > 0
        ? `Ainda nao ha escritorio pagante. ${emReais(a.receitaEmTeste)} por mes estao em teste e viram receita se assinarem.`
        : "Ainda nao ha escritorio pagante nem em teste.",
    );
  } else {
    t.push(
      `Receita mensal contratada de ${emReais(a.receitaMensal)}, em ${a.pagantes} escritorio(s) pagante(s), com ticket medio de ${emReais(a.ticketMedio)}.`,
    );
    if (a.receitaEmTeste > 0) {
      t.push(
        `Os testes somam ${emReais(a.receitaEmTeste)} por mes: se todos assinarem, a receita sobe ${porcento(a.receitaEmTeste, a.receitaMensal)}%.`,
      );
    }
  }

  if (a.vencido.total === 0) {
    t.push("Nenhuma fatura vencida em aberto.");
  } else {
    t.push(
      `${emReais(a.vencido.total)} vencidos em ${a.vencido.escritorios} escritorio(s)` +
        (a.receitaMensal ? `, ${a.vencido.porcentoDaReceita}% da receita mensal.` : "."),
    );
    const velho = a.vencido.porIdade.find((f) => f.chave === "MAIS_60")!;
    if (velho.valor > 0) {
      t.push(`${emReais(velho.valor)} estao vencidos ha mais de 60 dias: quanto mais velho, menor a chance de receber.`);
    }
    if (a.vencido.maiorDevedor) {
      const m = a.vencido.maiorDevedor;
      t.push(`Maior valor em atraso: ${m.nome}, ${emReais(m.valor)}, ha ${m.dias} dia(s).`);
    }
  }

  if (a.testesAcabando.length) {
    t.push(
      `${a.testesAcabando.length} teste(s) terminam nos proximos 7 dias: ${a.testesAcabando
        .map((x) => x.nome)
        .join(", ")}. E a hora da conversa comercial.`,
    );
  }

  if (a.concentracao && a.concentracao.porcento >= 30) {
    t.push(
      `${a.concentracao.nome} responde por ${a.concentracao.porcento}% da receita: a carteira depende demais de um escritorio.`,
    );
  }

  const [p1, p2, p3] = a.previsao;
  if (p1) {
    const garantido = [p1, p2, p3].filter(Boolean).reduce((s, m) => s + m!.garantido, 0);
    const comTestes = [p1, p2, p3].filter(Boolean).reduce((s, m) => s + m!.garantido + m!.testes, 0);
    t.push(
      `Proximos 3 meses: ${emReais(garantido)} garantidos pelas assinaturas` +
        (comTestes > garantido ? `; ate ${emReais(comTestes)} se os testes assinarem.` : "."),
    );
  }

  const n = a.recebidos.length;
  if (n >= 2 && a.recebidos[n - 2].valor > 0) {
    const antes = a.recebidos[n - 2].valor;
    const agora = a.recebidos[n - 1].valor;
    const variacao = Math.round(((agora - antes) / antes) * 100);
    t.push(
      `Recebido no mes: ${emReais(agora)} (${variacao >= 0 ? "+" : ""}${variacao}% sobre ${a.recebidos[n - 2].rotulo}; o mes corrente ainda esta em curso).`,
    );
  }
  return t;
}
