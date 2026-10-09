// Dados e identidade do escritorio: CNPJ, razao social, telefone, cidade e
// cores. Uma regra so para a tela de Administracao e para a implantacao.
import { comEscritorio } from "./prisma";
import { exigirCor } from "./identidade";
import { documentoValido, formatarDocumento } from "./documentos";

export class DadoInvalido extends Error {
  readonly status = 400;
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "DadoInvalido";
  }
}

export type DadosDoEscritorio = {
  corPrimaria?: string;
  corSecundaria?: string;
  telefoneAtendimento?: string | null;
  cidade?: string | null;
  cnpj?: string | null;
  razaoSocial?: string | null;
  /** Endereco da sede: e o que entra na qualificacao do escritorio na peca. */
  sede?: Record<string, string | null | undefined> | null;
};

/** Normaliza o endereco: CEP so digitos, UF maiuscula, rua com os dois nomes. */
export function enderecoLimpo(e: Record<string, string | null | undefined>): Record<string, string> | null {
  const t = (k: string) => (typeof e[k] === "string" ? e[k]!.trim() : "");
  const saida: Record<string, string> = {};
  const cep = t("cep").replace(/\D/g, "");
  if (cep) {
    if (cep.length !== 8) throw new DadoInvalido("CEP invalido: sao 8 digitos.");
    saida.cep = cep;
  }
  const rua = t("logradouro") || t("rua");
  if (rua) {
    saida.logradouro = rua;
    saida.rua = rua;
  }
  for (const k of ["numero", "complemento", "bairro", "cidade"]) if (t(k)) saida[k] = t(k);
  const uf = t("uf").toUpperCase();
  if (uf) {
    if (!/^[A-Z]{2}$/.test(uf)) throw new DadoInvalido("UF invalida: use a sigla, como SP.");
    saida.uf = uf;
  }
  return Object.keys(saida).length ? saida : null;
}

/**
 * Grava o que veio. Campo ausente nao mexe; campo vazio apaga.
 *
 * CNPJ e conferido aqui, nao so na tela: digito errado so apareceria como
 * recusa do meio de pagamento no dia da primeira fatura. Cor que nao e cor
 * nao entra: ela vira estilo no <body>.
 */
export async function salvarDadosDoEscritorio(escritorioId: string, d: DadosDoEscritorio) {
  const data: Record<string, string | null> = {};
  if (d.corPrimaria !== undefined) data.corPrimaria = exigirCor(d.corPrimaria, "principal");
  if (d.corSecundaria !== undefined) data.corSecundaria = exigirCor(d.corSecundaria, "de destaque");
  if (d.telefoneAtendimento !== undefined) data.telefoneAtendimento = d.telefoneAtendimento?.trim() || null;
  if (d.cidade !== undefined) data.cidade = d.cidade?.trim() || null;
  if (d.razaoSocial !== undefined) data.razaoSocial = d.razaoSocial?.trim() || null;
  if (d.cnpj !== undefined) {
    const bruto = d.cnpj?.trim();
    if (bruto && !documentoValido(bruto)) {
      throw new DadoInvalido("O CNPJ informado nao fecha o digito verificador.");
    }
    data.cnpj = bruto ? formatarDocumento(bruto) : null;
  }
  let enderecos: unknown[] | undefined;
  if (d.sede !== undefined) {
    // A sede e o primeiro endereco; as filiais, se houver, ficam como estao.
    const atual = await comEscritorio(escritorioId, (db) =>
      db.escritorio.findFirst({ where: { id: escritorioId }, select: { enderecos: true } }),
    );
    const filiais = Array.isArray(atual?.enderecos) ? (atual!.enderecos as unknown[]).slice(1) : [];
    const sede = d.sede ? enderecoLimpo(d.sede) : null;
    enderecos = sede ? [sede, ...filiais] : filiais;
    // A cidade da sede vale como cidade do escritorio quando ela esta vazia.
    if (sede?.cidade && !d.cidade?.trim()) data.cidade = sede.cidade;
  }
  await comEscritorio(escritorioId, (db) =>
    db.escritorio.update({
      where: { id: escritorioId },
      data: { ...data, ...(enderecos !== undefined ? { enderecos: enderecos as object[] } : {}) },
    }),
  );
  return data;
}
