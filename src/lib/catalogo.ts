// Catalogo do produto: modulos, faixas e metricas.
//
// So constantes e tipos. NAO importar Prisma nem nada de Node aqui: este
// arquivo e usado tanto pelo servidor quanto por componentes de cliente, e
// qualquer import de servidor arrastaria o banco para o bundle do navegador.

// ---------------------------------------------------------------------------
// Modulos
// ---------------------------------------------------------------------------

export const MODULOS = [
  "NUCLEO",
  "PUBLICACOES_DJEN",
  "WHATSAPP",
  "EMAIL",
  "NFSE",
  "COBRANCAS",
  "FINANCEIRO",
  "ASSINATURA",
  "IA",
  "NUVEM",
] as const;

export type Modulo = (typeof MODULOS)[number];

// ---------------------------------------------------------------------------
// Faixas de advogados
// ---------------------------------------------------------------------------

export const FAIXAS = ["ATE_1", "ATE_3", "ATE_10", "ATE_25", "ATE_50"] as const;
export type Faixa = (typeof FAIXAS)[number];

export const LIMITES: Record<
  Faixa,
  { advogados: number; apoio: number; rotulo: string }
> = {
  // O rotulo e do TAMANHO, nunca do plano. Enquanto a faixa se chamava
  // "Essencial" e o plano tambem, a mesma palavra queria dizer duas coisas na
  // mesma tela.
  ATE_1: { advogados: 1, apoio: 2, rotulo: "Solo" },
  ATE_3: { advogados: 3, apoio: 3, rotulo: "Pequeno" },
  ATE_10: { advogados: 10, apoio: 10, rotulo: "Escritorio" },
  ATE_25: { advogados: 25, apoio: 25, rotulo: "Grande" },
  ATE_50: { advogados: 50, apoio: 50, rotulo: "Corporativo" },
};

/**
 * As faixas com preco na vitrine.
 *
 * A maior fica de fora de proposito. Escritorio de 50 advogados no Brasil e
 * escritorio grande: tem sistema, negocia, compara proposta. Tabela publica
 * nessa faixa so serve para ancorar a conversa no numero errado — e a nossa
 * ancora util e o Completo de R$ 299 para escritorio pequeno. O preco da
 * faixa maior continua existindo no sistema, como referencia interna para
 * quem monta a proposta.
 */
export const FAIXAS_PUBLICADAS: Faixa[] = [
  "ATE_1",
  "ATE_3",
  "ATE_10",
  "ATE_25",
];
export const FAIXA_SOB_CONSULTA: Faixa = "ATE_50";

/** Como o tamanho aparece na tela. "ate 1 advogados" nao se escreve. */
export function rotuloDoTamanho(faixa: Faixa): string {
  const advogados = LIMITES[faixa].advogados;
  return advogados === 1 ? "1 advogado" : `ate ${advogados} advogados`;
}

export function faixaPublicada(faixa: Faixa): boolean {
  return FAIXAS_PUBLICADAS.includes(faixa);
}

export function ehFaixa(valor: string): valor is Faixa {
  return (FAIXAS as readonly string[]).includes(valor);
}

// ---------------------------------------------------------------------------
// Metricas de consumo
// ---------------------------------------------------------------------------

export const METRICAS = [
  "WHATSAPP_MSG",
  "EMAIL_ENVIADO",
  // Em MILHARES de tokens, nao em tokens. Preco sai em centavos inteiros, e
  // um centavo por token seria centenas de vezes o custo do modelo.
  "IA_MIL_TOKENS",
  "NFSE_EMITIDA",
  "COBRANCA_EMITIDA",
  "OAB_MONITORADA",
  "ARMAZENAMENTO_MB",
  "REGISTROS",
  "USUARIOS_ATIVOS",
] as const;

export type Metrica = (typeof METRICAS)[number];

/** Qual modulo paga por cada metrica. Metrica do nucleo nao tem modulo. */
export const MODULO_DA_METRICA: Partial<Record<Metrica, Modulo>> = {
  WHATSAPP_MSG: "WHATSAPP",
  EMAIL_ENVIADO: "EMAIL",
  IA_MIL_TOKENS: "IA",
  NFSE_EMITIDA: "NFSE",
  COBRANCA_EMITIDA: "COBRANCAS",
  ARMAZENAMENTO_MB: "NUVEM",
  OAB_MONITORADA: "PUBLICACOES_DJEN",
};
