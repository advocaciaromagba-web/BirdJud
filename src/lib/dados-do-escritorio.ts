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
};

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
  await comEscritorio(escritorioId, (db) =>
    db.escritorio.update({ where: { id: escritorioId }, data }),
  );
  return data;
}
