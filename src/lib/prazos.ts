/**
 * Contagem de prazo processual.
 *
 * A CONTA E FEITA AQUI, EM CODIGO, e nunca aceita pronta da leitura de um
 * documento. Prazo errado perde o direito, e e a unica coisa neste sistema
 * cujo erro nao tem conserto depois: a IA pode dizer "o documento fala em 15
 * dias", mas quem transforma isso em data e este arquivo, com regra escrita e
 * com teste.
 *
 * Base legal:
 *   CPC 219      — prazo processual conta-se so em dias uteis.
 *   CPC 224      — exclui o dia do comeco e inclui o do vencimento.
 *   CPC 224 § 1º — vencimento em dia sem expediente prorroga-se.
 *   CPC 220      — prazos suspensos entre 20 de dezembro e 20 de janeiro.
 *   Lei 5.010/66 art. 62 — dias sem expediente na Justica Federal.
 *   CPP 798      — prazo penal conta-se em dias corridos.
 *
 * DUAS COISAS QUE ESTE SISTEMA PRECISA E UM DE ESCRITORIO UNICO NAO PRECISA:
 *
 * 1. Cada escritorio trabalha em comarcas diferentes, e feriado municipal e
 *    suspensao de tribunal nao cabem numa lista nacional. Por isso os dias sem
 *    expediente do escritorio ENTRAM como parametro — a funcao continua pura e
 *    testavel, e cada escritorio tem o proprio calendario.
 *
 * 2. Nenhuma das funcoes daqui toca no banco. Quem busca os dias do escritorio
 *    e quem guarda o prazo e outra camada; aqui dentro so ha calendario e
 *    aritmetica, que e o que precisa estar certo.
 */

/** Feriados nacionais de data fixa, como [dia, mes]. */
const FERIADOS_FIXOS: ReadonlyArray<readonly [number, number]> = [
  [1, 1], // Confraternizacao Universal
  [21, 4], // Tiradentes
  [1, 5], // Dia do Trabalho
  [7, 9], // Independencia
  [12, 10], // Nossa Senhora Aparecida — Lei 6.802/80
  [2, 11], // Finados
  [15, 11], // Proclamacao da Republica
  [20, 11], // Consciencia Negra — Lei 14.759/2023
  [25, 12], // Natal
];

/** Dias sem expediente forense alem dos feriados nacionais. */
const FERIADOS_FORENSES: ReadonlyArray<readonly [number, number]> = [
  [11, 8], // Dia do Advogado — Lei 5.010/66 art. 62
  [1, 11], // Dia de Todos os Santos
  [8, 12], // Dia da Justica
];

/**
 * Domingo de Pascoa, pelo algoritmo de Meeus/Jones/Butcher.
 *
 * Carnaval, sexta-feira santa e Corpus Christi se penduram nele, e sao
 * exatamente os feriados que ninguem lembra de conferir.
 */
export function domingoDePascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const DIA_MS = 86_400_000;

function somaDias(d: Date, dias: number): Date {
  return new Date(d.getTime() + dias * DIA_MS);
}

/** A data como AAAA-MM-DD. E a chave de tudo aqui dentro. */
function chave(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const cacheNacional = new Map<number, Set<string>>();

/** Os dias sem expediente NACIONAIS do ano, ja resolvidos. */
export function feriadosNacionais(ano: number): Set<string> {
  const guardado = cacheNacional.get(ano);
  if (guardado) return guardado;

  const dias = new Set<string>();
  for (const [dia, mes] of [...FERIADOS_FIXOS, ...FERIADOS_FORENSES]) {
    dias.add(chave(new Date(Date.UTC(ano, mes - 1, dia))));
  }

  const pascoa = domingoDePascoa(ano);
  dias.add(chave(somaDias(pascoa, -48))); // segunda de carnaval
  dias.add(chave(somaDias(pascoa, -47))); // terca de carnaval
  dias.add(chave(somaDias(pascoa, -2))); // sexta-feira santa
  dias.add(chave(somaDias(pascoa, 60))); // corpus christi

  cacheNacional.set(ano, dias);
  return dias;
}

/** Recesso forense: 20 de dezembro a 20 de janeiro (CPC 220). */
export function dentroDoRecesso(d: Date): boolean {
  const mes = d.getUTCMonth() + 1;
  const dia = d.getUTCDate();
  return (mes === 12 && dia >= 20) || (mes === 1 && dia <= 20);
}

/** Dias sem expediente do proprio escritorio, em AAAA-MM-DD. */
export type Calendario = ReadonlySet<string> | ReadonlyArray<string>;

function temNoCalendario(calendario: Calendario | undefined, dia: string): boolean {
  if (!calendario) return false;
  return calendario instanceof Set
    ? calendario.has(dia)
    : (calendario as ReadonlyArray<string>).includes(dia);
}

/** Dia em que o prazo corre: nao e fim de semana, feriado nem recesso. */
export function ehDiaUtil(d: Date, calendario?: Calendario): boolean {
  const semana = d.getUTCDay();
  if (semana === 0 || semana === 6) return false;
  if (dentroDoRecesso(d)) return false;
  const dia = chave(d);
  if (feriadosNacionais(d.getUTCFullYear()).has(dia)) return false;
  return !temNoCalendario(calendario, dia);
}

/**
 * O proximo dia util, contando o proprio dia se ja for util.
 *
 * O limite existe para nao girar para sempre se alguem cadastrar o ano inteiro
 * como sem expediente — e ele LANCA em vez de devolver um dia errado. Devolver
 * em silencio uma data que nao e util seria devolver um prazo errado, que e o
 * unico desfecho que este arquivo nao pode ter.
 */
export function proximoDiaUtil(d: Date, calendario?: Calendario): Date {
  let atual = d;
  for (let i = 0; i <= 400; i++) {
    if (ehDiaUtil(atual, calendario)) return atual;
    atual = somaDias(atual, 1);
  }
  throw new Error(
    "Mais de 400 dias seguidos sem expediente: confira os dias cadastrados pelo escritorio.",
  );
}

export type Contagem = "UTEIS" | "CORRIDOS";

export type PrazoCalculado = {
  /** Data fatal, em AAAA-MM-DD. */
  vencimento: string;
  /** Dia em que o prazo comecou a correr. */
  inicioContagem: string;
  /** Em linguagem de gente, para alguem conferir sem abrir o codigo. */
  explicacao: string;
};

export class PrazoInvalido extends Error {
  readonly status = 400;
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "PrazoInvalido";
  }
}

/** Confere se a data existe de verdade no calendario (31/11 nao existe). */
export function dataValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [ano, mes, dia] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(ano!, mes! - 1, dia!));
  return (
    d.getUTCFullYear() === ano &&
    d.getUTCMonth() === mes! - 1 &&
    d.getUTCDate() === dia
  );
}

function formatar(d: Date): string {
  return chave(d).split("-").reverse().join("/");
}

function atravessaRecesso(de: Date, ate: Date): boolean {
  for (let d = de; d.getTime() <= ate.getTime(); d = somaDias(d, 1)) {
    if (dentroDoRecesso(d)) return true;
  }
  return false;
}

/**
 * A data fatal de um prazo.
 *
 * @param termoInicial Data da intimacao ou ciencia, em AAAA-MM-DD. O dia do
 *                     comeco e EXCLUIDO (CPC 224).
 * @param dias         Quantidade de dias do prazo.
 * @param contagem     UTEIS para prazo processual (CPC 219); CORRIDOS para
 *                     prazo de direito material, contrato e prazo penal
 *                     (CPP 798).
 * @param calendario   Dias sem expediente do escritorio, alem dos nacionais.
 */
export function calcularPrazo(
  termoInicial: string,
  dias: number,
  contagem: Contagem = "UTEIS",
  calendario?: Calendario,
): PrazoCalculado {
  if (!dataValida(termoInicial)) {
    throw new PrazoInvalido("Data do termo inicial invalida.");
  }
  if (!Number.isInteger(dias) || dias < 1 || dias > 1000) {
    throw new PrazoInvalido("O prazo precisa ser de 1 a 1000 dias.");
  }

  const inicio = new Date(`${termoInicial}T00:00:00Z`);

  if (contagem === "CORRIDOS") {
    // Conta todo dia, mas o vencimento ainda prorroga se cair em dia sem
    // expediente (CPC 224 § 1º) — e o engano mais comum de quem acha que
    // "corrido" quer dizer "sem prorrogar".
    const bruto = somaDias(inicio, dias);
    const vencimento = proximoDiaUtil(bruto, calendario);
    const prorrogou = chave(vencimento) !== chave(bruto);
    return {
      vencimento: chave(vencimento),
      inicioContagem: chave(somaDias(inicio, 1)),
      explicacao:
        `${dias} dias corridos a partir de ${formatar(inicio)}, excluido o dia do ` +
        `comeco (CPC 224). ` +
        (prorrogou
          ? `Cairia em ${formatar(bruto)}, dia sem expediente, e foi prorrogado para ` +
            `${formatar(vencimento)} (CPC 224 § 1º).`
          : `Vence em ${formatar(vencimento)}, dia util.`),
    };
  }

  // O prazo comeca a correr no primeiro dia util DEPOIS do termo inicial, e
  // esse dia ja e o primeiro dia do prazo.
  const inicioContagem = proximoDiaUtil(somaDias(inicio, 1), calendario);

  let atual = inicioContagem;
  for (let contados = 1; contados < dias; contados++) {
    atual = proximoDiaUtil(somaDias(atual, 1), calendario);
  }

  const suspendeu = atravessaRecesso(inicioContagem, atual);

  return {
    vencimento: chave(atual),
    inicioContagem: chave(inicioContagem),
    explicacao:
      `${dias} dias uteis (CPC 219). Comecou a correr em ${formatar(inicioContagem)} ` +
      `e vence em ${formatar(atual)}. Sabado, domingo e feriado nao contam` +
      (suspendeu
        ? ", e o prazo ficou suspenso no recesso de 20/12 a 20/01 (CPC 220)"
        : "") +
      ".",
  };
}

/** Quantos dias uteis faltam ate a data, a partir de hoje. Negativo se passou. */
export function diasUteisAte(
  deISO: string,
  ateISO: string,
  calendario?: Calendario,
): number {
  if (!dataValida(deISO) || !dataValida(ateISO)) {
    throw new PrazoInvalido("Data invalida.");
  }
  const de = new Date(`${deISO}T00:00:00Z`);
  const ate = new Date(`${ateISO}T00:00:00Z`);
  const atrasado = ate.getTime() < de.getTime();
  const [menor, maior] = atrasado ? [ate, de] : [de, ate];

  let contados = 0;
  for (let d = somaDias(menor, 1); d.getTime() <= maior.getTime(); d = somaDias(d, 1)) {
    if (ehDiaUtil(d, calendario)) contados++;
  }
  return atrasado ? -contados : contados;
}

/** AAAA-MM-DD vira DD/MM/AAAA. Vazio quando a data nao serve. */
export function paraBR(iso: string | null | undefined): string {
  return iso && dataValida(iso) ? iso.split("-").reverse().join("/") : "";
}

/**
 * A data que fica N dias uteis ANTES do vencimento, sem cair em dia morto.
 *
 * Serve para a antecedencia com que o escritorio quer tratar o prazo: o fatal
 * e do juizo, mas quem trabalha quer a peca pronta alguns dias antes.
 *
 * Dias UTEIS, e nao corridos, por um motivo pratico: tres dias corridos antes
 * de uma segunda-feira cai na sexta — mas tres dias corridos antes de uma
 * quarta cai no domingo, e aviso marcado para domingo e aviso que ninguem ve.
 *
 * Nunca devolve data anterior a `piso` (em geral, hoje). Publicacao lida com
 * atraso tem fatal daqui a dois dias; recuar tres dias uteis cairia ONTEM, e o
 * sistema estaria sugerindo trabalho para uma data que ja passou.
 */
export function recuarDiasUteis(
  vencimentoISO: string,
  dias: number,
  piso?: string,
  calendario?: Calendario,
): string {
  if (!dataValida(vencimentoISO)) {
    throw new PrazoInvalido("Data de vencimento invalida.");
  }
  if (!Number.isInteger(dias) || dias < 0 || dias > 365) {
    throw new PrazoInvalido("A antecedencia precisa ser de 0 a 365 dias.");
  }

  let d = new Date(`${vencimentoISO}T00:00:00Z`);
  let andados = 0;
  while (andados < dias) {
    d = somaDias(d, -1);
    if (ehDiaUtil(d, calendario)) andados++;
  }
  // O proprio vencimento pode cair em dia sem expediente quando a antecedencia
  // e zero; e quando ha recuo, o laco ja para em dia util.
  if (!ehDiaUtil(d, calendario)) d = proximoDiaUtil(d, calendario);

  const recuada = chave(d);
  if (!piso) return recuada;
  if (!dataValida(piso)) throw new PrazoInvalido("Data de piso invalida.");

  if (recuada >= piso) return recuada;
  // Ja passou: o mais cedo possivel e o proximo dia util a partir do piso —
  // nunca depois do proprio vencimento.
  const doPiso = chave(proximoDiaUtil(new Date(`${piso}T00:00:00Z`), calendario));
  return doPiso > vencimentoISO ? vencimentoISO : doPiso;
}
