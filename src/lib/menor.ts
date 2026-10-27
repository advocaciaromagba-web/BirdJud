// Cliente menor de idade (27/10/2026, vindo do sistema da Advocacia Roma).
//
// O documento sai no nome do menor — ele e a parte — acompanhado de quem
// exerce o poder familiar. O verbo muda com a idade, e nao e estilo:
//
//   - ate 16 anos incompletos, absolutamente incapaz (CC art. 3o): vai
//     "representado". Ato sem representacao e nulo (CC 166, I);
//   - de 16 a 18, relativamente incapaz (CC art. 4o, I): vai "assistido".
//     Ato sem assistencia e anulavel (CC 171, I).
//
// Trocar os dois da municao a parte contraria. Por isso a data de nascimento
// e obrigatoria para marcar menor, e a idade e contada na data do documento.

export type Regime = "REPRESENTADO" | "ASSISTIDO" | "MAIOR" | "SEM_DATA";

/** Idade em anos completos na data `hoje` (nascimento e coluna DATE, em UTC). */
export function idadeEm(nascimento: Date, hoje: Date): number {
  const n = { a: nascimento.getUTCFullYear(), m: nascimento.getUTCMonth(), d: nascimento.getUTCDate() };
  const h = hoje.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).split("-").map(Number);
  let idade = h[0] - n.a;
  if (h[1] - 1 < n.m || (h[1] - 1 === n.m && h[2] < n.d)) idade -= 1;
  return idade;
}

export function regimeDoMenor(nascimento: Date | null | undefined, hoje: Date): Regime {
  if (!nascimento) return "SEM_DATA";
  const idade = idadeEm(nascimento, hoje);
  if (idade < 16) return "REPRESENTADO";
  if (idade < 18) return "ASSISTIDO";
  return "MAIOR";
}

export const PARENTESCOS = ["GENITORA", "GENITOR", "TUTORA", "TUTOR", "RESPONSAVEL"] as const;
export type Parentesco = (typeof PARENTESCOS)[number];

const DO_PARENTESCO: Record<Parentesco, { texto: string; feminino: boolean }> = {
  GENITORA: { texto: "genitora", feminino: true },
  GENITOR: { texto: "genitor", feminino: false },
  TUTORA: { texto: "tutora", feminino: true },
  TUTOR: { texto: "tutor", feminino: false },
  RESPONSAVEL: { texto: "responsável legal", feminino: false },
};

export const ROTULO_DO_PARENTESCO: Record<Parentesco, string> = {
  GENITORA: "Mãe (genitora)",
  GENITOR: "Pai (genitor)",
  TUTORA: "Tutora",
  TUTOR: "Tutor",
  RESPONSAVEL: "Responsável legal",
};

export function ehParentesco(v: unknown): v is Parentesco {
  return typeof v === "string" && (PARENTESCOS as readonly string[]).includes(v);
}

/** "por sua genitora", "por seu genitor", "por seu responsável legal". */
export function porQuem(parentesco: string | null | undefined): { texto: string; feminino: boolean } {
  const p = ehParentesco(parentesco) ? DO_PARENTESCO[parentesco] : DO_PARENTESCO.RESPONSAVEL;
  return { texto: `por ${p.feminino ? "sua" : "seu"} ${p.texto}`, feminino: p.feminino };
}

/**
 * Como o menor entra na qualificacao, depois do nome e dos dados dele:
 * "menor impúbere, nascida em 03/04/2015, neste ato representada por sua
 * genitora ...". `quem` ja vem com cada representante qualificado.
 */
export function clausulaDoMenor(
  menor: { nascimento: Date | null | undefined; feminino: boolean },
  quem: Array<{ parentesco: string | null; qualificacao: string }>,
  hoje: Date,
): string | null {
  const regime = regimeDoMenor(menor.nascimento, hoje);
  if (regime === "MAIOR" || regime === "SEM_DATA" || quem.length === 0) return null;
  const f = menor.feminino;
  const nascido = menor.nascimento!.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  const verbo = regime === "REPRESENTADO" ? (f ? "representada" : "representado") : f ? "assistida" : "assistido";
  const pessoas = quem.map((q) => `${porQuem(q.parentesco).texto} ${q.qualificacao}`).join(" e ");
  return `menor ${regime === "REPRESENTADO" ? "impúbere" : "púbere"}, ${f ? "nascida" : "nascido"} em ${nascido}, neste ato ${verbo} ${pessoas}`;
}

/**
 * O que impede marcar (ou manter) o cliente como menor. Nulo: pode.
 * Sem data nao ha como saber se vai representado ou assistido; com 18 ou
 * mais, nao e menor.
 */
export function problemaDoMenor(nascimento: Date | null | undefined, hoje: Date): string | null {
  const regime = regimeDoMenor(nascimento, hoje);
  if (regime === "SEM_DATA") {
    return "Informe a data de nascimento do menor: é ela que decide se ele vai representado (até 16 anos) ou assistido (de 16 a 18).";
  }
  if (regime === "MAIOR") return "Pela data de nascimento, o cliente já tem 18 anos: não é menor.";
  return null;
}

/** Texto curto para a tela: "12 anos — vai representado". */
export function regimeEmTexto(nascimento: Date | null | undefined, hoje: Date): string {
  const regime = regimeDoMenor(nascimento, hoje);
  if (regime === "SEM_DATA") return "sem data de nascimento";
  const idade = idadeEm(nascimento!, hoje);
  if (regime === "MAIOR") return `${idade} anos — já é maior`;
  return `${idade} ${idade === 1 ? "ano" : "anos"} — vai ${regime === "REPRESENTADO" ? "representado (até 16 anos)" : "assistido (de 16 a 18)"}`;
}
