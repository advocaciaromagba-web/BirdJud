// Leitura do texto da publicacao: prazo e urgencia.
//
// Isto e triagem, nao conclusao juridica. O prazo detectado entra como
// sugestao visivel na tela, para o advogado conferir — nunca para o sistema
// decidir sozinho que algo nao precisa de atencao.
//
// Funcoes puras: entram texto, sai classificacao. Sem banco, sem rede.

const NUMERO_POR_EXTENSO: Record<string, number> = {
  um: 1, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8,
  nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30, sessenta: 60,
};

/** Palavras que, sozinhas, ja pedem olhar imediato. */
const TERMOS_URGENTES = [
  "audiencia",
  "audiência",
  "liminar",
  "tutela de urgencia",
  "tutela de urgência",
  "penhora",
  "bloqueio",
  "prisao",
  "prisão",
  "busca e apreensao",
  "busca e apreensão",
  "leilao",
  "leilão",
  "hasta publica",
  "hasta pública",
];

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Prazo em dias mencionado no texto.
 *
 * Pega "prazo de 15 dias", "no prazo de quinze dias", "em 5 (cinco) dias".
 * Havendo mais de um, fica com o MENOR: e o que vence primeiro.
 */
export function detectarPrazo(texto: string): number | null {
  const limpo = semAcento(texto);
  const achados: number[] = [];

  // Forma numerica: "15 dias", "5 (cinco) dias uteis"
  for (const achado of limpo.matchAll(/(\d{1,3})\s*(?:\([^)]*\)\s*)?dias?\b/g)) {
    const dias = Number(achado[1]);
    if (dias > 0 && dias <= 365) achados.push(dias);
  }

  // Forma por extenso: "quinze dias"
  const extenso = Object.keys(NUMERO_POR_EXTENSO).join("|");
  for (const achado of limpo.matchAll(new RegExp(`\\b(${extenso})\\s+dias?\\b`, "g"))) {
    achados.push(NUMERO_POR_EXTENSO[achado[1] as keyof typeof NUMERO_POR_EXTENSO]);
  }

  if (achados.length === 0) return null;
  return Math.min(...achados);
}

/**
 * Merece destaque na lista?
 *
 * Duas razoes: o texto cita um ato que nao espera (audiencia, liminar,
 * penhora...) ou o prazo detectado e curto.
 */
export function ehUrgente(texto: string, prazoDias: number | null): boolean {
  if (prazoDias !== null && prazoDias <= 5) return true;
  const limpo = semAcento(texto);
  return TERMOS_URGENTES.some((termo) => limpo.includes(semAcento(termo)));
}

/** Numero do processo em formato CNJ, so digitos, ou null. */
export function normalizarNumeroProcesso(numero: string | null): string | null {
  if (!numero) return null;
  const digitos = numero.replace(/\D/g, "");
  return digitos.length === 20 ? digitos : null;
}

/**
 * Como o numero do processo e GRAVADO.
 *
 * Numero CNJ vira so digitos; qualquer outra coisa fica como foi digitada.
 * Ter uma grafia canonica e o que permite casar a publicacao do DJEN com o
 * processo cadastrado — antes disso, "0001234-56.2026.8.26.0100" digitado com
 * mascara e o mesmo numero vindo do diario nunca se encontravam. Serve tambem
 * para a chave unica: com duas grafias, o mesmo processo entrava duas vezes.
 */
export function numeroParaGravar(numero: string): string {
  return normalizarNumeroProcesso(numero) ?? numero.trim();
}

/** Como o numero aparece para o humano: 0000000-00.0000.0.00.0000 */
export function formatarNumeroProcesso(digitos: string): string {
  if (digitos.length !== 20) return digitos;
  return `${digitos.slice(0, 7)}-${digitos.slice(7, 9)}.${digitos.slice(9, 13)}.${digitos.slice(13, 14)}.${digitos.slice(14, 16)}.${digitos.slice(16)}`;
}

export type Triagem = {
  prazoDias: number | null;
  urgente: boolean;
};

export function triar(texto: string): Triagem {
  const prazoDias = detectarPrazo(texto);
  return { prazoDias, urgente: ehUrgente(texto, prazoDias) };
}
