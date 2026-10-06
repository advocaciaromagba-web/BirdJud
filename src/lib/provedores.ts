// Em qual conta de cobranca do escritorio a cobranca nasce.
//
// O escritorio pode ter as duas. QUEM ESCOLHE E QUEM EMITE, sempre na hora: o
// sistema nunca escolhe por conta propria. Dinheiro de cliente caindo na conta
// que o escritorio nao esperava e o tipo de "ajuda" que ninguem quer.
export const PROVEDORES = ["ASAAS", "INFINITEPAY"] as const;
export type Provedor = (typeof PROVEDORES)[number];

export const NOME_DO_PROVEDOR: Record<Provedor, string> = {
  ASAAS: "Asaas",
  INFINITEPAY: "InfinitePay",
};

/** O que cada conta oferece a quem vai pagar. */
export const COMO_PAGA: Record<Provedor, string> = {
  ASAAS: "boleto, Pix ou cartao, como o escritorio escolher",
  INFINITEPAY: "link com Pix ou cartao, o cliente escolhe no checkout",
};
