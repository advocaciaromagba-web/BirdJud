// Regime tributario do escritorio para efeito da NFS-e.
//
// O escritorio muda de regime em data certa — fica fora do Simples ate
// 31/12 (ISS fixo de sociedade de profissionais na prefeitura) e entra no
// Simples em 01/01, com o ISS dentro do DAS. Em vez de alguem lembrar de
// trocar a configuracao na virada do ano, o regime futuro fica cadastrado e a
// nota usa o que valia na COMPETENCIA dela: nota emitida em janeiro para
// servico de dezembro sai pelo regime de dezembro, que e quando o servico foi
// prestado.
import type { Fiscal } from "@prisma/client";
import type { IbsCbsDps } from "./dps";

export type RegimeNfse = {
  opSimpNac: number;
  regApTribSN: number | null;
  regEspTrib: number;
  pTotTribSN: number | null;
  pTotTribFed: number | null;
  pTotTribEst: number | null;
  pTotTribMun: number | null;
  // Reforma tributaria — so usados quando a nota leva o grupo IBS/CBS.
  regApIBSCBSSN: number | null;
  cAtvSN: number | null;
};

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

type CamposDoRegime = Pick<
  Fiscal,
  | "opSimpNac"
  | "regApTribSN"
  | "regEspTrib"
  | "pTotTribSN"
  | "pTotTribFed"
  | "pTotTribEst"
  | "pTotTribMun"
  | "regApIBSCBSSN"
  | "cAtvSN"
  | "regimeFuturo"
  | "regimeFuturoDesde"
  | "ibsCbsDesde"
  | "cIndOp"
  | "cstIbsCbs"
  | "cClassTribIbsCbs"
>;

/** Le o regime futuro guardado em JSON; devolve null quando nao ha nada valido. */
export function lerRegimeFuturo(fiscal: Pick<Fiscal, "regimeFuturo">): RegimeNfse | null {
  const j = fiscal.regimeFuturo as Record<string, unknown> | null;
  if (!j || typeof j !== "object") return null;
  const opSimpNac = numero(j.opSimpNac);
  if (opSimpNac !== 1 && opSimpNac !== 3) return null;
  return {
    opSimpNac,
    regApTribSN: opSimpNac === 3 ? (numero(j.regApTribSN) ?? 1) : null,
    regEspTrib: numero(j.regEspTrib) ?? 0,
    pTotTribSN: opSimpNac === 3 ? numero(j.pTotTribSN) : null,
    pTotTribFed: opSimpNac === 1 ? numero(j.pTotTribFed) : null,
    pTotTribEst: opSimpNac === 1 ? numero(j.pTotTribEst) : null,
    pTotTribMun: opSimpNac === 1 ? numero(j.pTotTribMun) : null,
    regApIBSCBSSN: numero(j.regApIBSCBSSN),
    cAtvSN: numero(j.cAtvSN),
  };
}

export function regimeAtual(fiscal: CamposDoRegime): RegimeNfse {
  return {
    opSimpNac: fiscal.opSimpNac,
    regApTribSN: fiscal.regApTribSN,
    regEspTrib: fiscal.regEspTrib,
    pTotTribSN: numero(fiscal.pTotTribSN),
    pTotTribFed: numero(fiscal.pTotTribFed),
    pTotTribEst: numero(fiscal.pTotTribEst),
    pTotTribMun: numero(fiscal.pTotTribMun),
    regApIBSCBSSN: fiscal.regApIBSCBSSN,
    cAtvSN: fiscal.cAtvSN,
  };
}

/**
 * O que a nota declara de IBS/CBS na competencia — null enquanto nao chegar a
 * data marcada no cadastro. A Sefin Nacional recusa qualquer informacao de
 * IBS/CBS antes de 01/01/2026 (E0850); para optante do Simples o grupo passa
 * a ser obrigatorio em 01/01/2027.
 */
export function ibsCbsVigente(fiscal: CamposDoRegime, competencia: Date): IbsCbsDps | null {
  if (!fiscal.ibsCbsDesde || competencia < fiscal.ibsCbsDesde) return null;
  const cIndOp = fiscal.cIndOp?.trim();
  const cst = fiscal.cstIbsCbs?.trim();
  const cClassTrib = fiscal.cClassTribIbsCbs?.trim();
  if (!cIndOp || !cst || !cClassTrib) return null;
  return { cIndOp, cst, cClassTrib };
}

/** O que falta para a nota poder levar IBS/CBS. */
export function pendenciasDoIbsCbs(fiscal: CamposDoRegime): string[] {
  if (!fiscal.ibsCbsDesde) return [];
  const p: string[] = [];
  const desde = fiscal.ibsCbsDesde.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  if (!fiscal.cIndOp?.trim() || !fiscal.cstIbsCbs?.trim() || !fiscal.cClassTribIbsCbs?.trim()) {
    p.push(`Completar os codigos de IBS/CBS (operação, situação e classificação tributária) usados a partir de ${desde}.`);
  }
  if (fiscal.ibsCbsDesde < new Date("2026-01-01T00:00:00-03:00")) {
    p.push("A data de início do IBS/CBS não pode ser anterior a 01/01/2026 — a Receita recusa a nota (rejeição E0850).");
  }
  return p;
}

/** Regime que vale para a competencia informada (padrao: hoje). */
export function regimeVigente(fiscal: CamposDoRegime, competencia: Date = new Date()): RegimeNfse {
  const futuro = lerRegimeFuturo(fiscal);
  if (futuro && fiscal.regimeFuturoDesde && competencia >= fiscal.regimeFuturoDesde) return futuro;
  return regimeAtual(fiscal);
}

/** Como o regime aparece para quem nao fala "opSimpNac". */
export function descreverRegime(r: RegimeNfse): string {
  const simples = r.opSimpNac === 3 ? "Optante do Simples Nacional" : "Não optante do Simples";
  const iss =
    r.regEspTrib === 6
      ? "ISS fixo de sociedade de profissionais"
      : r.opSimpNac === 3
        ? "ISS dentro do DAS"
        : "ISS normal sobre o faturamento";
  return `${simples}, ${iss}`;
}

/** O que falta informar num regime para a nota poder ser emitida. */
export function pendenciasDoRegime(r: RegimeNfse, quando: string): string[] {
  const p: string[] = [];
  if (r.opSimpNac === 3 && (r.pTotTribSN === null || r.pTotTribSN === undefined)) {
    p.push(`Informar o percentual aproximado de tributos do Simples Nacional${quando} (o contador informa).`);
  }
  if (r.opSimpNac === 1 && [r.pTotTribFed, r.pTotTribEst, r.pTotTribMun].some((v) => v === null || v === undefined)) {
    p.push(`Informar o percentual aproximado de tributos federais, estaduais e municipais${quando} (Lei 12.741 — o contador informa).`);
  }
  return p;
}
