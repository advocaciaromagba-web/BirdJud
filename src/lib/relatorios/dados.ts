// Os dados dos relatorios, em blocos neutros (02/11/2026, vindo do sistema da
// Advocacia Roma).
//
// Nada aqui sabe que vai virar PDF: cada relatorio devolve resumo, grafico,
// tabela e texto como estrutura, e quem desenha e pdf.ts. O numero do PDF e o
// mesmo que apareceria em qualquer outro formato.
//
// De onde sai cada numero no BirdJud:
// - cobrancas: a tabela Cobranca (com as baixas manuais);
// - financeiro e caixa: o livro-caixa (Lancamento com pagoEm), que ja recebe
//   a baixa das cobrancas — somar cobranca e lancamento contaria duas vezes;
// - previsoes: cobranca em aberto (o que falta) e lancamento sem pagoEm.
import { comEscritorio } from "../prisma";
import { rotuloDaCategoria } from "../financeiro";

const FUSO = "America/Sao_Paulo";
const DIA = 86_400_000;

export const TIPOS_DE_RELATORIO = ["clientes", "cobrancas", "financeiro", "caixa", "previsoes"] as const;
export type TipoDeRelatorio = (typeof TIPOS_DE_RELATORIO)[number];

export const NOME_DO_RELATORIO: Record<TipoDeRelatorio, string> = {
  clientes: "Clientes",
  cobrancas: "Cobranças e inadimplência",
  financeiro: "Financeiro (resultado)",
  caixa: "Caixa (movimento)",
  previsoes: "Previsões (a receber e a pagar)",
};

export type Periodo = { de: Date; ate: Date; rotulo: string };
export type Coluna = { titulo: string; largura: number; direita?: boolean };
export type Bloco =
  | { tipo: "resumo"; itens: { rotulo: string; valor: string; tom?: "bom" | "ruim" }[] }
  | { tipo: "texto"; texto: string }
  | {
      tipo: "grafico";
      titulo: string;
      series: { nome: string; cor: "azul" | "verde" | "vermelho" | "dourado" }[];
      pontos: { rotulo: string; valores: number[] }[];
      /** Em centavos quando dinheiro. */
      formato: "dinheiro" | "numero";
    }
  | { tipo: "tabela"; titulo?: string; colunas: Coluna[]; linhas: string[][]; alerta?: number[]; vazio?: string };

export type Relatorio = { titulo: string; subtitulo: string; escritorio: string; periodo: Periodo; blocos: Bloco[] };

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export const reais = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (d: Date) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: FUSO }).format(d);
const pct = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** O periodo vale em Brasilia: do comeco do primeiro dia ao fim do ultimo. */
export function montarPeriodo(de: string, ate: string): Periodo {
  const inicio = new Date(`${de}T00:00:00-03:00`);
  const fim = new Date(`${ate}T23:59:59.999-03:00`);
  return { de: inicio, ate: fim, rotulo: `${dataBR(inicio)} a ${dataBR(fim)}` };
}

/** "aaaa-mm" em Brasilia: cobranca que vence dia 1o a 0h nao cai no mes anterior. */
export function chaveDoMes(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: FUSO }).format(d).slice(0, 7);
}

const NOMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const rotuloDoMes = (chave: string) => `${NOMES[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`;

/** Os meses do periodo, em ordem. No maximo 36: grafico com mais nao se le. */
export function mesesDoPeriodo(p: Periodo): string[] {
  const meses: string[] = [];
  let [ano, mes] = chaveDoMes(p.de).split("-").map(Number);
  const fim = chaveDoMes(p.ate);
  while (meses.length < 36) {
    const chave = `${ano}-${String(mes).padStart(2, "0")}`;
    meses.push(chave);
    if (chave >= fim) break;
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return meses;
}

/** Dias inteiros de atraso entre o vencimento e a referencia (0 se em dia). */
export function diasDeAtraso(vencimento: Date, referencia: Date): number {
  const v = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(vencimento)}T00:00:00-03:00`);
  const r = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(referencia)}T00:00:00-03:00`);
  return Math.max(0, Math.round((r.getTime() - v.getTime()) / DIA));
}

export const FAIXAS_DE_ATRASO = [
  { rotulo: "Até 15 dias", min: 1, max: 15 },
  { rotulo: "16 a 30 dias", min: 16, max: 30 },
  { rotulo: "31 a 60 dias", min: 31, max: 60 },
  { rotulo: "61 a 90 dias", min: 61, max: 90 },
  { rotulo: "Mais de 90 dias", min: 91, max: Infinity },
];

const ROTULO_DA_SITUACAO: Record<string, string> = {
  ABERTA: "Em aberto",
  PARCIAL: "Paga em parte",
  PAGA: "Paga",
  VENCIDA: "Vencida",
  CANCELADA: "Cancelada",
  ESTORNADA: "Estornada",
  PENDENTE: "Pendente",
};

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

async function relatorioClientes(escritorioId: string, periodo: Periodo, todos: boolean): Promise<Omit<Relatorio, "escritorio">> {
  const clientes = await comEscritorio(escritorioId, (db) =>
    db.cliente.findMany({
      where: todos ? {} : { criadoEm: { gte: periodo.de, lte: periodo.ate } },
      orderBy: { nome: "asc" },
      select: {
        nome: true,
        documento: true,
        telefone: true,
        endereco: true,
        criadoEm: true,
        _count: { select: { processos: true } },
        cobrancas: { select: { valorCentavos: true, valorPagoCentavos: true, status: true } },
      },
    }),
  );
  const novosPorMes = new Map<string, number>();
  for (const c of clientes) {
    if (c.criadoEm >= periodo.de && c.criadoEm <= periodo.ate) novosPorMes.set(chaveDoMes(c.criadoEm), (novosPorMes.get(chaveDoMes(c.criadoEm)) ?? 0) + 1);
  }
  const comCobranca = clientes.filter((c) => c.cobrancas.length > 0).length;
  const linhas = clientes.map((c) => {
    const validas = c.cobrancas.filter((x) => x.status !== "CANCELADA" && x.status !== "PENDENTE");
    const cobrado = validas.reduce((t, x) => t + x.valorCentavos, 0);
    const recebido = validas.reduce((t, x) => t + (x.status === "PAGA" ? (x.valorPagoCentavos ?? x.valorCentavos) : (x.valorPagoCentavos ?? 0)), 0);
    const cidade = (c.endereco as { cidade?: string } | null)?.cidade ?? "—";
    return [c.nome, c.documento ?? "—", c.telefone ?? "—", cidade, dataBR(c.criadoEm), String(c._count.processos), reais(cobrado), reais(recebido)];
  });
  return {
    titulo: "Relatório de clientes",
    subtitulo: todos ? "Todos os clientes cadastrados" : "Clientes cadastrados no período",
    periodo,
    blocos: [
      {
        tipo: "resumo",
        itens: [
          { rotulo: "Clientes no relatório", valor: String(clientes.length) },
          { rotulo: "Novos no período", valor: String([...novosPorMes.values()].reduce((t, v) => t + v, 0)) },
          { rotulo: "Com cobrança emitida", valor: String(comCobranca) },
        ],
      },
      {
        tipo: "grafico",
        titulo: "Clientes cadastrados por mês",
        series: [{ nome: "Novos clientes", cor: "azul" }],
        pontos: mesesDoPeriodo(periodo).map((m) => ({ rotulo: rotuloDoMes(m), valores: [novosPorMes.get(m) ?? 0] })),
        formato: "numero",
      },
      {
        tipo: "tabela",
        colunas: [
          { titulo: "Cliente", largura: 190 },
          { titulo: "CPF/CNPJ", largura: 95 },
          { titulo: "Telefone", largura: 85 },
          { titulo: "Cidade", largura: 90 },
          { titulo: "Cadastro", largura: 58 },
          { titulo: "Processos", largura: 50, direita: true },
          { titulo: "Cobrado", largura: 75, direita: true },
          { titulo: "Recebido", largura: 75, direita: true },
        ],
        linhas,
        vazio: "Nenhum cliente no período.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Cobrancas e inadimplencia
// ---------------------------------------------------------------------------

async function relatorioCobrancas(escritorioId: string, periodo: Periodo, agora: Date): Promise<Omit<Relatorio, "escritorio">> {
  const cobrancas = await comEscritorio(escritorioId, (db) =>
    db.cobranca.findMany({
      where: { vencimento: { gte: periodo.de, lte: periodo.ate }, status: { not: "PENDENTE" } },
      orderBy: { vencimento: "asc" },
      include: { cliente: { select: { id: true, nome: true } }, baixas: { select: { valorCentavos: true, data: true } } },
    }),
  );
  const recebidoDe = (c: (typeof cobrancas)[number]) =>
    c.status === "PAGA" ? (c.valorPagoCentavos ?? c.valorCentavos) : c.baixas.reduce((t, b) => t + b.valorCentavos, 0);
  const faltaDe = (c: (typeof cobrancas)[number]) => (c.status === "PAGA" ? 0 : Math.max(0, c.valorCentavos - recebidoDe(c)));
  const validas = cobrancas.filter((c) => c.status !== "CANCELADA" && c.status !== "ESTORNADA");
  const emitido = validas.reduce((t, c) => t + c.valorCentavos, 0);
  const recebido = validas.reduce((t, c) => t + recebidoDe(c), 0);
  const vencidas = validas.filter((c) => c.status !== "PAGA" && diasDeAtraso(c.vencimento, agora) > 0);
  const valorVencido = vencidas.reduce((t, c) => t + faltaDe(c), 0);
  const inadimplentes = new Set(vencidas.map((c) => c.cliente.id));
  // Inadimplencia em DINHEIRO sobre o emitido: e o tamanho do buraco. A
  // contagem vai ao lado, porque dez boletos pequenos e um grande nao sao o mesmo.
  const taxa = emitido ? (valorVencido / emitido) * 100 : 0;
  const porFaixa = FAIXAS_DE_ATRASO.map((f) => {
    const dentro = vencidas.filter((c) => {
      const d = diasDeAtraso(c.vencimento, agora);
      return d >= f.min && d <= f.max;
    });
    return { rotulo: f.rotulo, quantidade: dentro.length, valor: dentro.reduce((t, c) => t + faltaDe(c), 0) };
  });

  const linhas: string[][] = [];
  const alerta: number[] = [];
  for (const c of cobrancas) {
    const atrasoHoje = c.status !== "PAGA" && c.status !== "CANCELADA" && c.status !== "ESTORNADA" ? diasDeAtraso(c.vencimento, agora) : 0;
    // Paga com atraso tambem e dado sobre o cliente, mesmo que hoje nao deva nada.
    const atrasoNoPagamento = c.status === "PAGA" && c.pagoEm ? diasDeAtraso(c.vencimento, c.pagoEm) : 0;
    if (atrasoHoje > 0) alerta.push(linhas.length);
    linhas.push([
      c.cliente.nome,
      c.descricao,
      c.parcelaNumero && c.parcelaTotal ? `${c.parcelaNumero}/${c.parcelaTotal}` : "—",
      dataBR(c.vencimento),
      ROTULO_DA_SITUACAO[c.status] ?? c.status,
      atrasoHoje ? `${atrasoHoje} dia(s)` : atrasoNoPagamento ? `pago com ${atrasoNoPagamento} dia(s)` : "—",
      reais(c.valorCentavos),
      reais(recebidoDe(c)),
      reais(faltaDe(c)),
    ]);
  }

  return {
    titulo: "Relatório de cobranças",
    subtitulo: "Cobranças com vencimento no período, com o atraso de cada uma",
    periodo,
    blocos: [
      {
        tipo: "resumo",
        itens: [
          { rotulo: "Emitido", valor: reais(emitido) },
          { rotulo: "Recebido", valor: reais(recebido), tom: "bom" },
          { rotulo: "Em aberto", valor: reais(Math.max(0, emitido - recebido)) },
          { rotulo: "Vencido", valor: reais(valorVencido), tom: valorVencido ? "ruim" : undefined },
          { rotulo: "Inadimplência", valor: pct(taxa), tom: taxa ? "ruim" : "bom" },
          { rotulo: "Clientes inadimplentes", valor: `${inadimplentes.size} (${vencidas.length} cobrança(s))`, tom: inadimplentes.size ? "ruim" : "bom" },
        ],
      },
      {
        tipo: "texto",
        texto:
          "Inadimplência é o valor vencido e não pago dividido pelo total emitido no período. A contagem de cobranças aparece ao lado porque dez boletos pequenos e um grande não significam a mesma coisa.",
      },
      {
        tipo: "grafico",
        titulo: "Valor vencido por faixa de atraso",
        series: [{ nome: "Valor vencido", cor: "vermelho" }],
        pontos: porFaixa.map((f) => ({ rotulo: f.rotulo, valores: [f.valor] })),
        formato: "dinheiro",
      },
      {
        tipo: "tabela",
        titulo: "Atrasos por faixa",
        colunas: [
          { titulo: "Faixa de atraso", largura: 160 },
          { titulo: "Cobranças", largura: 80, direita: true },
          { titulo: "Valor vencido", largura: 110, direita: true },
        ],
        linhas: porFaixa.map((f) => [f.rotulo, String(f.quantidade), reais(f.valor)]),
      },
      {
        tipo: "tabela",
        titulo: "Cobranças do período",
        colunas: [
          { titulo: "Cliente", largura: 140 },
          { titulo: "Descrição", largura: 165 },
          { titulo: "Parc.", largura: 34 },
          { titulo: "Vence", largura: 58 },
          { titulo: "Situação", largura: 64 },
          { titulo: "Atraso", largura: 80 },
          { titulo: "Valor", largura: 62, direita: true },
          { titulo: "Recebido", largura: 62, direita: true },
          { titulo: "Falta", largura: 62, direita: true },
        ],
        linhas,
        alerta,
        vazio: "Nenhuma cobrança com vencimento no período.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Financeiro e caixa: o livro-caixa
// ---------------------------------------------------------------------------

async function realizados(escritorioId: string, periodo: Periodo) {
  return comEscritorio(escritorioId, (db) =>
    db.lancamento.findMany({
      where: { pagoEm: { gte: periodo.de, lte: periodo.ate } },
      orderBy: { pagoEm: "asc" },
      select: { descricao: true, tipo: true, categoria: true, fornecedor: true, valorCentavos: true, pagoEm: true },
    }),
  );
}

async function relatorioFinanceiro(escritorioId: string, periodo: Periodo): Promise<Omit<Relatorio, "escritorio">> {
  const lancamentos = await realizados(escritorioId, periodo);
  const meses = mesesDoPeriodo(periodo);
  const porMes = new Map<string, { receita: number; despesa: number }>();
  const porCategoria = new Map<string, number>();
  for (const l of lancamentos) {
    const k = chaveDoMes(l.pagoEm!);
    const m = porMes.get(k) ?? { receita: 0, despesa: 0 };
    if (l.tipo === "RECEITA") m.receita += l.valorCentavos;
    else {
      m.despesa += l.valorCentavos;
      const cat = l.categoria ? rotuloDaCategoria(l.categoria) : "Sem categoria";
      porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + l.valorCentavos);
    }
    porMes.set(k, m);
  }
  const receita = lancamentos.filter((l) => l.tipo === "RECEITA").reduce((t, l) => t + l.valorCentavos, 0);
  const despesa = lancamentos.filter((l) => l.tipo !== "RECEITA").reduce((t, l) => t + l.valorCentavos, 0);
  const resultado = receita - despesa;
  return {
    titulo: "Relatório financeiro",
    subtitulo: "Receitas e despesas realizadas (pagas) no período",
    periodo,
    blocos: [
      {
        tipo: "resumo",
        itens: [
          { rotulo: "Receita", valor: reais(receita), tom: "bom" },
          { rotulo: "Despesa", valor: reais(despesa) },
          { rotulo: "Resultado", valor: reais(resultado), tom: resultado >= 0 ? "bom" : "ruim" },
          { rotulo: "Margem", valor: receita ? pct((resultado / receita) * 100) : "—", tom: resultado >= 0 ? "bom" : "ruim" },
        ],
      },
      {
        tipo: "grafico",
        titulo: "Receita e despesa por mês",
        series: [
          { nome: "Receita", cor: "verde" },
          { nome: "Despesa", cor: "vermelho" },
        ],
        pontos: meses.map((m) => ({ rotulo: rotuloDoMes(m), valores: [porMes.get(m)?.receita ?? 0, porMes.get(m)?.despesa ?? 0] })),
        formato: "dinheiro",
      },
      {
        tipo: "tabela",
        titulo: "Mês a mês",
        colunas: [
          { titulo: "Mês", largura: 90 },
          { titulo: "Receita", largura: 120, direita: true },
          { titulo: "Despesa", largura: 120, direita: true },
          { titulo: "Resultado", largura: 120, direita: true },
        ],
        linhas: meses.map((m) => {
          const v = porMes.get(m) ?? { receita: 0, despesa: 0 };
          return [rotuloDoMes(m), reais(v.receita), reais(v.despesa), reais(v.receita - v.despesa)];
        }),
        alerta: meses.map((m, i) => ((porMes.get(m)?.receita ?? 0) < (porMes.get(m)?.despesa ?? 0) ? i : -1)).filter((i) => i >= 0),
      },
      {
        tipo: "tabela",
        titulo: "Despesas por categoria",
        colunas: [
          { titulo: "Categoria", largura: 180 },
          { titulo: "Total", largura: 120, direita: true },
          { titulo: "% da despesa", largura: 100, direita: true },
        ],
        linhas: [...porCategoria.entries()].sort((a, b) => b[1] - a[1]).map(([cat, v]) => [cat, reais(v), despesa ? pct((v / despesa) * 100) : "—"]),
        vazio: "Nenhuma despesa paga no período.",
      },
    ],
  };
}

async function relatorioCaixa(escritorioId: string, periodo: Periodo): Promise<Omit<Relatorio, "escritorio">> {
  const lancamentos = await realizados(escritorioId, periodo);
  let acumulado = 0;
  const linhas: string[][] = [];
  const alerta: number[] = [];
  const fimDoMes = new Map<string, number>();
  for (const l of lancamentos) {
    const entrada = l.tipo === "RECEITA" ? l.valorCentavos : 0;
    const saida = l.tipo === "RECEITA" ? 0 : l.valorCentavos;
    acumulado += entrada - saida;
    if (acumulado < 0) alerta.push(linhas.length);
    const historico = l.tipo === "RECEITA" ? l.descricao : `${l.descricao}${l.fornecedor ? ` — ${l.fornecedor}` : ""}${l.categoria ? ` (${rotuloDaCategoria(l.categoria)})` : ""}`;
    linhas.push([dataBR(l.pagoEm!), historico, entrada ? reais(entrada) : "—", saida ? reais(saida) : "—", reais(acumulado)]);
    fimDoMes.set(chaveDoMes(l.pagoEm!), acumulado);
  }
  const entradas = lancamentos.filter((l) => l.tipo === "RECEITA").reduce((t, l) => t + l.valorCentavos, 0);
  const saidas = lancamentos.filter((l) => l.tipo !== "RECEITA").reduce((t, l) => t + l.valorCentavos, 0);
  let corrente = 0;
  const pontos = mesesDoPeriodo(periodo).map((m) => {
    if (fimDoMes.has(m)) corrente = fimDoMes.get(m)!;
    return { rotulo: rotuloDoMes(m), valores: [corrente] };
  });
  return {
    titulo: "Relatório de caixa",
    subtitulo: "Entradas e saídas realizadas, em ordem de data",
    periodo,
    blocos: [
      {
        tipo: "resumo",
        itens: [
          { rotulo: "Entradas", valor: reais(entradas), tom: "bom" },
          { rotulo: "Saídas", valor: reais(saidas) },
          { rotulo: "Saldo do período", valor: reais(entradas - saidas), tom: entradas - saidas >= 0 ? "bom" : "ruim" },
          { rotulo: "Movimentos", valor: String(lancamentos.length) },
        ],
      },
      {
        tipo: "texto",
        texto: "O saldo aqui é o do movimento do período, começando do zero: não é o saldo da conta bancária, que depende do que havia antes.",
      },
      { tipo: "grafico", titulo: "Saldo acumulado ao fim de cada mês", series: [{ nome: "Saldo acumulado", cor: "azul" }], pontos, formato: "dinheiro" },
      {
        tipo: "tabela",
        titulo: "Movimento",
        colunas: [
          { titulo: "Data", largura: 64 },
          { titulo: "Histórico", largura: 380 },
          { titulo: "Entrada", largura: 90, direita: true },
          { titulo: "Saída", largura: 90, direita: true },
          { titulo: "Saldo", largura: 95, direita: true },
        ],
        linhas,
        alerta,
        vazio: "Nenhum movimento no período.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Previsoes
// ---------------------------------------------------------------------------

async function relatorioPrevisoes(escritorioId: string, periodo: Periodo): Promise<Omit<Relatorio, "escritorio">> {
  const [cobrancas, lancamentos] = await comEscritorio(escritorioId, (db) =>
    Promise.all([
      db.cobranca.findMany({
        where: { status: { in: ["ABERTA", "VENCIDA", "PARCIAL"] }, vencimento: { gte: periodo.de, lte: periodo.ate } },
        include: { cliente: { select: { nome: true } }, baixas: { select: { valorCentavos: true } } },
        orderBy: { vencimento: "asc" },
      }),
      db.lancamento.findMany({
        where: { pagoEm: null, vencimento: { gte: periodo.de, lte: periodo.ate } },
        orderBy: { vencimento: "asc" },
      }),
    ]),
  );
  // Parcela de contrato prevista no livro-caixa e ja emitida como cobranca:
  // vale a cobranca. As duas juntas contariam o mesmo honorario duas vezes.
  const emitidas = new Set(cobrancas.filter((c) => c.contratoId).map((c) => `${c.contratoId}:${c.parcelaNumero}`));
  const receber = [
    ...cobrancas.map((c) => ({
      quando: c.vencimento,
      quem: c.cliente.nome,
      oQue: c.descricao,
      valor: c.valorCentavos - c.baixas.reduce((t, b) => t + b.valorCentavos, 0),
    })),
    ...lancamentos
      .filter((l) => l.tipo === "RECEITA" && !(l.contratoId && emitidas.has(`${l.contratoId}:${l.parcelaNumero}`)))
      .map((l) => ({ quando: l.vencimento!, quem: "—", oQue: l.descricao, valor: l.valorCentavos })),
  ].sort((a, b) => a.quando.getTime() - b.quando.getTime());
  const pagar = lancamentos.filter((l) => l.tipo !== "RECEITA");

  const meses = mesesDoPeriodo(periodo);
  const porMes = new Map<string, { receber: number; pagar: number }>();
  for (const r of receber) {
    const m = porMes.get(chaveDoMes(r.quando)) ?? { receber: 0, pagar: 0 };
    m.receber += r.valor;
    porMes.set(chaveDoMes(r.quando), m);
  }
  for (const p of pagar) {
    const m = porMes.get(chaveDoMes(p.vencimento!)) ?? { receber: 0, pagar: 0 };
    m.pagar += p.valorCentavos;
    porMes.set(chaveDoMes(p.vencimento!), m);
  }
  const totalReceber = receber.reduce((t, r) => t + r.valor, 0);
  const totalPagar = pagar.reduce((t, p) => t + p.valorCentavos, 0);
  return {
    titulo: "Relatório de previsões",
    subtitulo: "O que está previsto entrar e sair no período",
    periodo,
    blocos: [
      {
        tipo: "resumo",
        itens: [
          { rotulo: "Previsto a receber", valor: reais(totalReceber), tom: "bom" },
          { rotulo: "Previsto a pagar", valor: reais(totalPagar) },
          { rotulo: "Saldo previsto", valor: reais(totalReceber - totalPagar), tom: totalReceber - totalPagar >= 0 ? "bom" : "ruim" },
        ],
      },
      {
        tipo: "texto",
        texto: "Previsão é o que está lançado, não o que vai acontecer: cobrança em aberto pode atrasar, e conta ainda não lançada não aparece aqui.",
      },
      {
        tipo: "grafico",
        titulo: "Previsto por mês",
        series: [
          { nome: "A receber", cor: "verde" },
          { nome: "A pagar", cor: "vermelho" },
        ],
        pontos: meses.map((m) => ({ rotulo: rotuloDoMes(m), valores: [porMes.get(m)?.receber ?? 0, porMes.get(m)?.pagar ?? 0] })),
        formato: "dinheiro",
      },
      {
        tipo: "tabela",
        titulo: "A receber",
        colunas: [
          { titulo: "Vence", largura: 64 },
          { titulo: "Cliente", largura: 200 },
          { titulo: "Descrição", largura: 330 },
          { titulo: "Valor", largura: 110, direita: true },
        ],
        linhas: receber.map((r) => [dataBR(r.quando), r.quem, r.oQue, reais(r.valor)]),
        vazio: "Nada a receber no período.",
      },
      {
        tipo: "tabela",
        titulo: "A pagar",
        colunas: [
          { titulo: "Vence", largura: 64 },
          { titulo: "Descrição", largura: 300 },
          { titulo: "Fornecedor", largura: 140 },
          { titulo: "Categoria", largura: 90 },
          { titulo: "Valor", largura: 110, direita: true },
        ],
        linhas: pagar.map((p) => [dataBR(p.vencimento!), p.descricao, p.fornecedor ?? "—", p.categoria ? rotuloDaCategoria(p.categoria) : "—", reais(p.valorCentavos)]),
        vazio: "Nada a pagar lançado no período.",
      },
    ],
  };
}

export async function montarRelatorio(
  escritorioId: string,
  tipo: TipoDeRelatorio,
  periodo: Periodo,
  opcoes: { todosOsClientes?: boolean; agora?: Date } = {},
): Promise<Relatorio> {
  const agora = opcoes.agora ?? new Date();
  const escritorio = await comEscritorio(escritorioId, (db) => db.escritorio.findFirstOrThrow({ where: { id: escritorioId }, select: { nome: true } }));
  const corpo =
    tipo === "clientes"
      ? await relatorioClientes(escritorioId, periodo, Boolean(opcoes.todosOsClientes))
      : tipo === "cobrancas"
        ? await relatorioCobrancas(escritorioId, periodo, agora)
        : tipo === "financeiro"
          ? await relatorioFinanceiro(escritorioId, periodo)
          : tipo === "caixa"
            ? await relatorioCaixa(escritorioId, periodo)
            : await relatorioPrevisoes(escritorioId, periodo);
  return { ...corpo, escritorio: escritorio.nome };
}
