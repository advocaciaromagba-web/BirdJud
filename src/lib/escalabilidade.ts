// Escalabilidade: quanto a plataforma aguenta e o que acaba primeiro.
//
// So conta, nada de banco nem de rede aqui: quem coleta e
// escalabilidade-coleta.ts. Separado assim para os calculos terem teste sem
// precisar de Railway nem de PostgreSQL.
//
// Tres perguntas que o painel responde:
//   1. Qual recurso esta mais perto do limite agora (o gargalo).
//   2. No ritmo de crescimento atual, em quantos meses ele acaba.
//   3. Com o uso medio de hoje por escritorio, quantos escritorios cabem —
//      e o que precisa mudar em 10, 50, 100, 250 e 500.

/** Acima disto o recurso entra em atencao; acima de CRITICO, em alerta. */
export const ATENCAO = 0.7;
export const CRITICO = 0.85;

export type Nivel = "ok" | "atencao" | "critico";

export type Recurso = {
  chave: string;
  rotulo: string;
  usado: number;
  limite: number;
  /** Como escrever usado e limite na tela. */
  unidade: "bytes" | "conexoes" | "porcento" | "nucleos" | "gb";
  detalhe?: string;
};

export const fracao = (r: { usado: number; limite: number }) => (r.limite > 0 ? r.usado / r.limite : 0);

export function nivelDe(f: number): Nivel {
  if (f >= CRITICO) return "critico";
  if (f >= ATENCAO) return "atencao";
  return "ok";
}

/** Do mais cheio para o mais folgado. Recurso sem limite conhecido fica de fora. */
export function gargalos(recursos: Recurso[]): Array<Recurso & { fracao: number; nivel: Nivel }> {
  return recursos
    .filter((r) => r.limite > 0)
    .map((r) => ({ ...r, fracao: fracao(r), nivel: nivelDe(fracao(r)) }))
    .sort((a, b) => b.fracao - a.fracao);
}

export function percentil(valores: number[], p: number): number {
  if (!valores.length) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const i = Math.min(ordenados.length - 1, Math.max(0, Math.ceil((p / 100) * ordenados.length) - 1));
  return ordenados[i];
}

export const mediana = (valores: number[]) => percentil(valores, 50);

export const media = (valores: number[]) =>
  valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : 0;

/**
 * Crescimento por mes, pela reta dos minimos quadrados sobre os ultimos meses
 * de uma serie ACUMULADA (o total ao fim de cada mes). Menos de dois pontos:
 * zero — nao ha ritmo para medir.
 */
export function crescimentoPorMes(acumulado: number[], janela = 6): number {
  const s = acumulado.slice(-janela);
  const n = s.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = media(s);
  let num = 0;
  let den = 0;
  s.forEach((y, x) => {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  });
  return den ? num / den : 0;
}

/** Meses ate `alvo`, no ritmo dado. null = nao chega (parado ou caindo). */
export function mesesAte(atual: number, alvo: number, porMes: number): number | null {
  if (atual >= alvo) return 0;
  if (porMes <= 0) return null;
  return (alvo - atual) / porMes;
}

/** Soma acumulada: de "quanto entrou em cada mes" para "total ao fim de cada mes". */
export function acumular(porMes: number[], inicial = 0): number[] {
  let total = inicial;
  return porMes.map((v) => (total += v));
}

// ---------------------------------------------------------------------------
// Servicos do Railway
// ---------------------------------------------------------------------------

export type PontoDeMetrica = { ts: number; valor: number };

export type ResumoDoServico = {
  servicoId: string;
  nome: string;
  cpu: { media: number; pico: number; limite: number };
  memoriaGb: { media: number; pico: number; atual: number; limite: number };
  redeSaidaGb: number;
  discoGb: number | null;
  /** Memoria ao longo da janela, para a linha do grafico. */
  serieMemoria: PontoDeMetrica[];
  serieCpu: PontoDeMetrica[];
};

const ultimo = (p: PontoDeMetrica[]) => (p.length ? p[p.length - 1].valor : 0);
const valores = (p: PontoDeMetrica[]) => p.map((x) => x.valor);

export function resumirServicos(
  series: Array<{ servicoId: string; medida: string; pontos: PontoDeMetrica[] }>,
  nomes: Record<string, string>,
): ResumoDoServico[] {
  const porServico = new Map<string, Record<string, PontoDeMetrica[]>>();
  for (const s of series) {
    const m = porServico.get(s.servicoId) ?? {};
    m[s.medida] = s.pontos;
    porServico.set(s.servicoId, m);
  }
  const resumos: ResumoDoServico[] = [];
  for (const [servicoId, m] of porServico) {
    const cpu = m.CPU_USAGE ?? [];
    const mem = m.MEMORY_USAGE_GB ?? [];
    // Servico que so tem disco (o volume do backup, por exemplo) nao roda: fica de fora.
    if (!cpu.length && !mem.length) continue;
    resumos.push({
      servicoId,
      nome: nomes[servicoId] ?? servicoId.slice(0, 8),
      cpu: { media: media(valores(cpu)), pico: Math.max(0, ...valores(cpu)), limite: ultimo(m.CPU_LIMIT ?? []) },
      memoriaGb: {
        media: media(valores(mem)),
        pico: Math.max(0, ...valores(mem)),
        atual: ultimo(mem),
        limite: ultimo(m.MEMORY_LIMIT_GB ?? []),
      },
      redeSaidaGb: valores(m.NETWORK_TX_GB ?? []).reduce((s, v) => s + v, 0),
      discoGb: m.DISK_USAGE_GB?.length ? ultimo(m.DISK_USAGE_GB) : null,
      serieMemoria: mem,
      serieCpu: cpu,
    });
  }
  // A aplicacao primeiro, depois o resto pelo uso de memoria.
  return resumos.sort((a, b) => b.memoriaGb.pico - a.memoriaGb.pico);
}

// ---------------------------------------------------------------------------
// Simulacao: o que acontece com N escritorios
// ---------------------------------------------------------------------------

export type BaseDaSimulacao = {
  /** Escritorios que usam o sistema hoje (fora os encerrados). */
  escritorios: number;
  bytesBanco: number;
  /** O banco vazio (catalogo e tabelas sem linha) nao cresce com escritorio. */
  bytesBancoFixo: number;
  limiteBanco: number;
  bytesArquivos: number;
  limiteArquivos: number;
  /** Segundos de trabalho do trabalhador nas ultimas 24 h. */
  segundosDeTrabalhoPorDia: number;
  trabalhadores: number;
  /** Memoria de pico da aplicacao, em GB (Railway), e o limite dela. */
  memoriaAppGb: number | null;
  limiteMemoriaAppGb: number | null;
};

export type LinhaDaSimulacao = {
  escritorios: number;
  banco: number;
  arquivos: number;
  /** Fracao do dia em que um trabalhador ficaria ocupado. */
  ocupacaoTrabalhador: number;
  trabalhadoresNecessarios: number;
  /** O primeiro recurso a passar do limite de atencao, se algum. */
  estoura: string[];
};

export const ALVOS_DA_SIMULACAO = [10, 50, 100, 250, 500];

/**
 * Projeta o uso por escritorio de hoje para N escritorios. E linear de
 * proposito: escritorio novo usa o banco, o disco e a fila como os de hoje.
 * Com poucos escritorios na base a media e grosseira — a tela diz isso.
 */
export function simularEscala(base: BaseDaSimulacao, alvos = ALVOS_DA_SIMULACAO): LinhaDaSimulacao[] {
  const n = Math.max(1, base.escritorios);
  const bancoPorEscritorio = Math.max(0, base.bytesBanco - base.bytesBancoFixo) / n;
  const arquivosPorEscritorio = base.bytesArquivos / n;
  const trabalhoPorEscritorio = base.segundosDeTrabalhoPorDia / n;
  return alvos.map((alvo) => {
    const banco = base.bytesBancoFixo + bancoPorEscritorio * alvo;
    const arquivos = arquivosPorEscritorio * alvo;
    const ocupacao = (trabalhoPorEscritorio * alvo) / 86_400;
    const estoura: string[] = [];
    if (base.limiteBanco && banco / base.limiteBanco >= ATENCAO) estoura.push("disco do banco");
    if (base.limiteArquivos && arquivos / base.limiteArquivos >= ATENCAO) estoura.push("disco dos arquivos");
    if (ocupacao / Math.max(1, base.trabalhadores) >= ATENCAO) estoura.push("fila de trabalhos");
    return {
      escritorios: alvo,
      banco,
      arquivos,
      ocupacaoTrabalhador: ocupacao,
      trabalhadoresNecessarios: Math.max(1, Math.ceil(ocupacao / ATENCAO)),
      estoura,
    };
  });
}

/** Quantos escritorios cabem ate o limite de atencao de um recurso. */
export function cabem(porEscritorio: number, limite: number, fixo = 0): number | null {
  if (porEscritorio <= 0 || limite <= 0) return null;
  return Math.max(0, Math.floor((limite * ATENCAO - fixo) / porEscritorio));
}

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

export type TabelaDoBanco = {
  nome: string;
  bytes: number;
  linhas: number;
  linhasMortas: number;
  leiturasSequenciais: number;
  leiturasPorIndice: number;
};

/**
 * Tabela grande lida inteira com frequencia: falta indice. Pequena nao conta —
 * o PostgreSQL le tabela pequena inteira de proposito, e mais rapido.
 */
export function suspeitasDeIndice(tabelas: TabelaDoBanco[], minimoDeLinhas = 10_000): TabelaDoBanco[] {
  return tabelas.filter(
    (t) => t.linhas >= minimoDeLinhas && t.leiturasSequenciais > Math.max(100, t.leiturasPorIndice),
  );
}

/** Mais de 20% de linhas mortas numa tabela com volume: o autovacuum nao esta dando conta. */
export function precisamDeVacuum(tabelas: TabelaDoBanco[]): TabelaDoBanco[] {
  return tabelas.filter((t) => t.linhasMortas > 1_000 && t.linhasMortas / Math.max(1, t.linhas + t.linhasMortas) > 0.2);
}

// ---------------------------------------------------------------------------
// O que fazer
// ---------------------------------------------------------------------------

export type EstadoParaRecomendar = {
  gargalos: Array<{ rotulo: string; fracao: number; nivel: Nivel }>;
  mesesAteBancoCheio: number | null;
  mesesAteArquivosCheios: number | null;
  ocupacaoTrabalhador: number;
  trabalhadores: number;
  atrasadosNaFila: number;
  esperaP95Segundos: number;
  cacheDoBanco: number | null;
  latenciaBancoMs: number;
  conexoes: { usadas: number; maximo: number };
  suspeitasDeIndice: string[];
  precisamDeVacuum: string[];
  semMetricasDoRailway: boolean;
  escritorios: number;
};

const meses = (m: number) => (m < 1 ? "menos de um mês" : `${Math.round(m)} ${Math.round(m) === 1 ? "mês" : "meses"}`);

export function recomendar(e: EstadoParaRecomendar): string[] {
  const t: string[] = [];
  for (const g of e.gargalos.filter((x) => x.nivel !== "ok")) {
    t.push(
      `${g.rotulo} em ${Math.round(g.fracao * 100)}%: ${
        g.nivel === "critico" ? "aumentar agora" : "programar o aumento"
      } antes de passar de ${Math.round(CRITICO * 100)}%.`,
    );
  }
  if (e.mesesAteBancoCheio !== null && e.mesesAteBancoCheio < 6)
    t.push(`No ritmo atual, o disco do banco chega a ${Math.round(ATENCAO * 100)}% em ${meses(e.mesesAteBancoCheio)}. Aumentar o volume no Railway antes disso.`);
  if (e.mesesAteArquivosCheios !== null && e.mesesAteArquivosCheios < 6)
    t.push(`No ritmo atual, o disco dos arquivos chega a ${Math.round(ATENCAO * 100)}% em ${meses(e.mesesAteArquivosCheios)}. Aumentar o volume ou ligar a cópia no armazenamento externo.`);
  const porTrabalhador = e.ocupacaoTrabalhador / Math.max(1, e.trabalhadores);
  if (porTrabalhador >= ATENCAO)
    t.push(`O trabalhador passa ${Math.round(porTrabalhador * 100)}% do dia ocupado. Subir mais uma réplica do serviço "trabalhador": a fila já aceita vários ao mesmo tempo.`);
  if (e.atrasadosNaFila > 0 || e.esperaP95Segundos > 300)
    t.push(`Há trabalho esperando na fila (${e.atrasadosNaFila} atrasado(s), 95% começam em até ${Math.round(e.esperaP95Segundos)} s). Se continuar, é sinal de trabalhador a menos.`);
  if (e.conexoes.maximo && e.conexoes.usadas / e.conexoes.maximo >= ATENCAO)
    t.push(`Conexões do banco em ${e.conexoes.usadas} de ${e.conexoes.maximo}. Limitar o pool de cada serviço (connection_limit na URL) ou pôr um PgBouncer na frente antes de subir réplicas.`);
  if (e.cacheDoBanco !== null && e.cacheDoBanco < 0.95)
    t.push(`Só ${(e.cacheDoBanco * 100).toFixed(1)}% das leituras do banco vêm da memória. Abaixo de 95%, o banco precisa de mais RAM (shared_buffers).`);
  if (e.latenciaBancoMs > 20)
    t.push(`A ida e volta ao banco está em ${Math.round(e.latenciaBancoMs)} ms. O normal na rede interna do Railway é abaixo de 5 ms: conferir se a URL usa o endereço privado.`);
  if (e.suspeitasDeIndice.length)
    t.push(`Tabela(s) grande(s) lida(s) inteira(s) com frequência: ${e.suspeitasDeIndice.join(", ")}. Falta índice para alguma consulta.`);
  if (e.precisamDeVacuum.length)
    t.push(`Muitas linhas mortas em ${e.precisamDeVacuum.join(", ")}: o autovacuum não está dando conta.`);
  if (!t.length) t.push("Tudo com folga: nenhum recurso passou de 70% e nada indica falta de capacidade nos próximos seis meses.");
  if (e.semMetricasDoRailway)
    t.push("CPU e memória dos serviços não aparecem: falta a variável RAILWAY_TOKEN_METRICAS (token do projeto no Railway) na aplicação.");
  if (e.escritorios < 5)
    t.push(`Com ${e.escritorios} escritório(s) na base, as projeções por escritório são grosseiras. Elas ficam confiáveis a partir de uns 10.`);
  return t;
}
