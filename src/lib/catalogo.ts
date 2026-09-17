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
  "PUBLICACOES_AASP",
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

export const FAIXAS = ["ATE_3", "ATE_10", "ATE_25", "ATE_50"] as const;
export type Faixa = (typeof FAIXAS)[number];

export const LIMITES: Record<Faixa, { advogados: number; apoio: number; rotulo: string }> = {
  ATE_3: { advogados: 3, apoio: 3, rotulo: "Essencial" },
  ATE_10: { advogados: 10, apoio: 10, rotulo: "Escritorio" },
  ATE_25: { advogados: 25, apoio: 25, rotulo: "Profissional" },
  ATE_50: { advogados: 50, apoio: 50, rotulo: "Completo" },
};

export function ehFaixa(valor: string): valor is Faixa {
  return (FAIXAS as readonly string[]).includes(valor);
}

// ---------------------------------------------------------------------------
// Metricas de consumo
// ---------------------------------------------------------------------------

export const METRICAS = [
  "WHATSAPP_MSG",
  "EMAIL_ENVIADO",
  "IA_TOKENS",
  "NFSE_EMITIDA",
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
  IA_TOKENS: "IA",
  NFSE_EMITIDA: "NFSE",
  OAB_MONITORADA: "PUBLICACOES_DJEN",
};
