// Cadastro do emissor de NFS-e: a mesma validacao para o escritorio
// (/api/nfse) e para a Blackbird (/api/plataforma/emissor).
import { z } from "zod";
import { Prisma } from "@prisma/client";

/** "6,00" -> 6. Vazio -> null. */
const percentual = z
  .string()
  .max(8)
  .nullish()
  .transform((v, ctx) => {
    if (!v?.trim()) return null;
    const n = Number(v.trim().replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Percentual inválido." });
      return z.NEVER;
    }
    return new Prisma.Decimal(n.toFixed(2));
  });

const data = z
  .string()
  .nullish()
  .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00-03:00`) : null));

export const cadastroFiscal = z.object({
  razaoSocial: z.string().min(2).max(200),
  cnpj: z.string().min(14).max(20),
  inscricaoMunicipal: z.string().max(30).nullish(),
  codigoMunicipio: z.string().regex(/^\d{7}$/, "Código IBGE com 7 dígitos."),
  telefone: z.string().max(30).nullish(),
  email: z.string().max(200).nullish(),
  opSimpNac: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  regApTribSN: z.number().int().min(1).max(3).nullish(),
  regEspTrib: z.number().int().min(0).max(9),
  pTotTribSN: percentual,
  pTotTribFed: percentual,
  pTotTribEst: percentual,
  pTotTribMun: percentual,
  regimeFuturoDesde: data,
  regimeFuturo: z
    .object({
      opSimpNac: z.number().int(),
      regApTribSN: z.number().int().nullish(),
      regEspTrib: z.number().int(),
      pTotTribSN: z.string().nullish(),
      pTotTribFed: z.string().nullish(),
      pTotTribEst: z.string().nullish(),
      pTotTribMun: z.string().nullish(),
    })
    .nullish(),
  ibsCbsDesde: data,
  cIndOp: z.string().max(10).nullish(),
  cstIbsCbs: z.string().max(5).nullish(),
  cClassTribIbsCbs: z.string().max(10).nullish(),
  regApIBSCBSSN: z.number().int().min(1).max(3).nullish(),
  cAtvSN: z.number().int().nullish(),
  codigoTributacao: z.string().regex(/^\d{6}$/, "Código de tributação nacional com 6 dígitos."),
  codigoNbs: z.string().max(12).nullish(),
  descricaoPadrao: z.string().max(2000).nullish(),
  serie: z.string().regex(/^\d{1,5}$/).optional(),
  proximoNumero: z.number().int().min(1).optional(),
  ambiente: z.enum(["HOMOLOGACAO", "PRODUCAO"]),
});


export type CadastroFiscal = z.infer<typeof cadastroFiscal>;

/** O cadastro validado, no formato das colunas (Fiscal e FiscalDaPlataforma). */
export function dadosDoCadastroFiscal(d: CadastroFiscal) {
  const { regimeFuturo, serie, proximoNumero, ...resto } = d;
  return {
    ...resto,
    cnpj: resto.cnpj.replace(/\D/g, ""),
    inscricaoMunicipal: resto.inscricaoMunicipal?.trim() || null,
    telefone: resto.telefone?.trim() || null,
    email: resto.email?.trim() || null,
    // Nao optante nao informa regApTribSN (E0162).
    regApTribSN: resto.opSimpNac === 3 ? (resto.regApTribSN ?? 1) : null,
    regimeFuturo: resto.regimeFuturoDesde && regimeFuturo ? (regimeFuturo as Prisma.InputJsonValue) : Prisma.DbNull,
    ...(serie ? { serie } : {}),
    ...(proximoNumero ? { proximoNumero } : {}),
  };
}

const dec = (v: unknown) => (v === null || v === undefined ? "" : String(Number(v)).replace(".", ","));

/** Campos que os dois cadastros (Fiscal e FiscalDaPlataforma) tem em comum. */
type CadastroGravado = {
  razaoSocial: string;
  cnpj: string;
  inscricaoMunicipal: string | null;
  codigoMunicipio: string;
  telefone: string | null;
  email: string | null;
  opSimpNac: number;
  regEspTrib: number;
  pTotTribSN: unknown;
  pTotTribFed: unknown;
  pTotTribEst: unknown;
  pTotTribMun: unknown;
  regimeFuturoDesde: Date | null;
  regimeFuturo: unknown;
  ibsCbsDesde: Date | null;
  cIndOp: string | null;
  cstIbsCbs: string | null;
  cClassTribIbsCbs: string | null;
  regApIBSCBSSN: number | null;
  cAtvSN: number | null;
  codigoTributacao: string;
  codigoNbs: string | null;
  descricaoPadrao: string | null;
  serie: string;
  proximoNumero: number;
  ambiente: string;
};

/** O cadastro gravado no formato do formulario (ConfigFiscal). */
export function fiscalParaTela(f: CadastroGravado) {
  const futuro = (f.regimeFuturo ?? null) as Record<string, unknown> | null;
  return {
    razaoSocial: f.razaoSocial,
    cnpj: f.cnpj,
    inscricaoMunicipal: f.inscricaoMunicipal ?? "",
    codigoMunicipio: f.codigoMunicipio,
    telefone: f.telefone ?? "",
    email: f.email ?? "",
    opSimpNac: f.opSimpNac,
    regEspTrib: f.regEspTrib,
    pTotTribSN: dec(f.pTotTribSN),
    pTotTribFed: dec(f.pTotTribFed),
    pTotTribEst: dec(f.pTotTribEst),
    pTotTribMun: dec(f.pTotTribMun),
    regimeFuturoDesde: f.regimeFuturoDesde?.toISOString().slice(0, 10) ?? "",
    futuroOpSimpNac: Number(futuro?.opSimpNac ?? 3),
    futuroRegEspTrib: Number(futuro?.regEspTrib ?? 0),
    futuroPTotTribSN: String(futuro?.pTotTribSN ?? ""),
    futuroPTotTribFed: String(futuro?.pTotTribFed ?? ""),
    futuroPTotTribEst: String(futuro?.pTotTribEst ?? ""),
    futuroPTotTribMun: String(futuro?.pTotTribMun ?? ""),
    ibsCbsDesde: f.ibsCbsDesde?.toISOString().slice(0, 10) ?? "",
    cIndOp: f.cIndOp ?? "100301",
    cstIbsCbs: f.cstIbsCbs ?? "000",
    cClassTribIbsCbs: f.cClassTribIbsCbs ?? "000001",
    regApIBSCBSSN: f.regApIBSCBSSN !== null ? String(f.regApIBSCBSSN) : "",
    cAtvSN: f.cAtvSN !== null ? String(f.cAtvSN) : "",
    codigoTributacao: f.codigoTributacao,
    codigoNbs: f.codigoNbs ?? "",
    descricaoPadrao: f.descricaoPadrao ?? "",
    serie: f.serie,
    proximoNumero: f.proximoNumero,
    ambiente: f.ambiente,
  };
}
