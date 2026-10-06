/**
 * Representantes legais de pessoa juridica.
 *
 * POR QUE ISTO EXISTE: quando o cliente e empresa, quem assina a procuracao e
 * o contrato nao e "a empresa" — e uma pessoa, com nome, CPF e qualificacao
 * propria, e as vezes mais de uma (socios que assinam em conjunto). Sem isso,
 * a qualificacao da peca sai incompleta e a procuracao sai assinada por quem a
 * tela conseguiu adivinhar.
 *
 * UMA DIFERENCA DELIBERADA EM RELACAO AO SISTEMA DE ORIGEM: la o PRIMEIRO
 * representante mora em campos do proprio cliente e os demais em outra tabela.
 * Aqui todos moram no mesmo lugar, em ordem. Dois lugares para o mesmo tipo de
 * dado e onde nasce a divergencia: um codigo le so a tabela, outro le so os
 * campos, e a peca sai com um representante a menos.
 */
import { cpfValido, digitosDe } from "./documentos";

export type Endereco = {
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
};

export type RepresentanteEntrada = {
  nome?: string | null;
  cpf?: string | null;
  rg?: string | null;
  nacionalidade?: string | null;
  estadoCivil?: string | null;
  profissao?: string | null;
  email?: string | null;
  telefone?: string | null;
  mesmoEnderecoDaEmpresa?: boolean;
  endereco?: Endereco | null;
};

export type RepresentanteLimpo = {
  ordem: number;
  nome: string;
  cpf: string;
  rg: string | null;
  nacionalidade: string | null;
  estadoCivil: string | null;
  profissao: string | null;
  email: string | null;
  telefone: string | null;
  mesmoEnderecoDaEmpresa: boolean;
  endereco: Endereco | null;
};

export class RepresentanteInvalido extends Error {
  readonly status = 400;
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "RepresentanteInvalido";
  }
}

function texto(valor: unknown): string | null {
  const t = typeof valor === "string" ? valor.trim() : "";
  return t || null;
}

const UM_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Cliente e pessoa juridica? E o que decide se a tela pede representante. */
export function ehPessoaJuridica(documento: string | null | undefined): boolean {
  return digitosDe(documento ?? "").length === 14;
}

function limparEndereco(endereco: Endereco | null | undefined): Endereco | null {
  if (!endereco) return null;
  const limpo: Endereco = {
    rua: texto(endereco.rua),
    numero: texto(endereco.numero),
    complemento: texto(endereco.complemento),
    bairro: texto(endereco.bairro),
    cidade: texto(endereco.cidade),
    uf: texto(endereco.uf)?.toUpperCase() ?? null,
    cep: texto(endereco.cep),
  };
  return Object.values(limpo).some(Boolean) ? limpo : null;
}

/**
 * Valida a lista vinda da tela.
 *
 * LINHA TOTALMENTE EM BRANCO E IGNORADA, nao recusada: um formulario com tres
 * linhas em que a pessoa preencheu duas nao deve dar erro por causa da
 * terceira. Mas linha COMECADA e recusada, porque metade de um representante
 * vai para a procuracao do mesmo jeito.
 *
 * RECUSA A LISTA INTEIRA, nao o item: gravar dois de tres e deixar o terceiro
 * de fora em silencio e como a peca sai faltando um socio.
 */
export function prepararRepresentantes(
  bruto: unknown,
): RepresentanteLimpo[] {
  if (!Array.isArray(bruto)) return [];

  const lista: RepresentanteLimpo[] = [];
  const cpfsVistos = new Set<string>();

  for (const item of bruto as RepresentanteEntrada[]) {
    if (!item || typeof item !== "object") continue;

    const temAlgo =
      Object.entries(item).some(
        ([chave, v]) =>
          chave !== "mesmoEnderecoDaEmpresa" &&
          typeof v === "string" &&
          v.trim() !== "",
      ) || limparEndereco(item.endereco) !== null;
    if (!temAlgo) continue;

    const ordinal = lista.length + 1;
    const nome = texto(item.nome);
    const cpf = texto(item.cpf);

    if (!nome || !cpf) {
      throw new RepresentanteInvalido(
        `Informe o nome e o CPF do ${ordinal}º representante legal.`,
      );
    }
    if (!cpfValido(cpf)) {
      throw new RepresentanteInvalido(
        `O CPF do ${ordinal}º representante legal nao fecha o digito verificador.`,
      );
    }
    const soDigitos = digitosDe(cpf);
    if (cpfsVistos.has(soDigitos)) {
      // Duas linhas com o mesmo CPF costuma ser a mesma pessoa digitada duas
      // vezes — e ela assinaria duas vezes a mesma procuracao.
      throw new RepresentanteInvalido(
        "O mesmo CPF aparece em mais de um representante legal.",
      );
    }
    cpfsVistos.add(soDigitos);

    const email = texto(item.email);
    if (email && !UM_EMAIL.test(email)) {
      throw new RepresentanteInvalido(
        `O e-mail do ${ordinal}º representante legal nao parece valido.`,
      );
    }

    const mesmoEndereco = item.mesmoEnderecoDaEmpresa !== false;
    lista.push({
      ordem: lista.length,
      nome,
      cpf,
      rg: texto(item.rg),
      nacionalidade: texto(item.nacionalidade),
      estadoCivil: texto(item.estadoCivil),
      profissao: texto(item.profissao),
      email,
      telefone: texto(item.telefone),
      mesmoEnderecoDaEmpresa: mesmoEndereco,
      // Endereco proprio so e guardado quando a pessoa disse que e outro: o
      // contrario deixaria um endereco antigo pendurado, pronto para sair na
      // peca depois que a empresa mudou de sede.
      endereco: mesmoEndereco ? null : limparEndereco(item.endereco),
    });
  }

  return lista;
}

/** O endereco escrito em uma linha, como entra na qualificacao. */
export function enderecoEmLinha(endereco: Endereco | null): string {
  if (!endereco) return "";
  const rua = [endereco.rua, endereco.numero].filter(Boolean).join(", ");
  return [rua, endereco.complemento, endereco.bairro, endereco.cidade, endereco.uf, endereco.cep]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * A qualificacao do representante, como entra na peca.
 *
 * O que nao foi preenchido simplesmente NAO APARECE. Nada de "estado civil:
 * nao informado" numa peticao, e nada de inventar: campo em branco e campo em
 * branco, e quem assina decide se completa.
 */
export function qualificacao(
  r: Pick<
    RepresentanteLimpo,
    | "nome"
    | "cpf"
    | "rg"
    | "nacionalidade"
    | "estadoCivil"
    | "profissao"
    | "endereco"
    | "mesmoEnderecoDaEmpresa"
  >,
  enderecoDaEmpresa: Endereco | null = null,
): string {
  const endereco = r.mesmoEnderecoDaEmpresa ? enderecoDaEmpresa : r.endereco;
  const partes = [
    r.nacionalidade,
    r.estadoCivil,
    r.profissao,
    r.rg ? `portador do RG nº ${r.rg}` : null,
    `inscrito no CPF sob o nº ${r.cpf}`,
    enderecoEmLinha(endereco) ? `residente e domiciliado em ${enderecoEmLinha(endereco)}` : null,
  ].filter(Boolean);
  return `${r.nome}, ${partes.join(", ")}`;
}
