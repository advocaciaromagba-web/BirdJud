// A qualificacao do escritorio e dos advogados, como entra na peca.
//
// O jeito foi colhido de contratos e procuracoes reais de escritorio: a
// qualificacao e um paragrafo corrido, nao uma ficha, e o que nao esta
// preenchido simplesmente NAO APARECE. Nada de "estado civil: ___" impresso
// no papel que o cliente vai assinar.
//
// Nada aqui toca banco.
import { formatarDocumento } from "./documentos";

export type Endereco = {
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
};

export type EscritorioParaQualificar = {
  nome: string;
  razaoSocial?: string | null;
  cnpj?: string | null;
  registroOab?: string | null;
  cidade?: string | null;
  enderecos?: unknown;
};

export type AdvogadoParaQualificar = {
  nome: string;
  oab?: string | null;
  cpf?: string | null;
  rg?: string | null;
  nacionalidade?: string | null;
  estadoCivil?: string | null;
  sociedade?: string | null;
  sociedadeCnpj?: string | null;
};

function limpo(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function enderecoEmLinha(e: Endereco | null | undefined): string {
  if (!e) return "";
  const rua = [limpo(e.logradouro), limpo(e.numero)].filter(Boolean).join(", nº ");
  return [rua, limpo(e.complemento), limpo(e.bairro), limpo(e.cidade), limpo(e.uf), limpo(e.cep)]
    .filter(Boolean)
    .join(", ");
}

/** A sede e o primeiro endereco cadastrado. Os outros sao filiais. */
export function sedeDe(enderecos: unknown): Endereco | null {
  if (!Array.isArray(enderecos) || enderecos.length === 0) return null;
  const primeiro = enderecos[0];
  return primeiro && typeof primeiro === "object" ? (primeiro as Endereco) : null;
}

/**
 * O escritorio, por extenso.
 *
 * "Fulano Sociedade Unipessoal de Advocacia, pessoa juridica de direito
 * privado, inscrita no CNPJ sob o nº ..., com Registro de Sociedade de
 * Advocacia nº ... junto a OAB, com sede a ..."
 */
export function qualificacaoDoEscritorio(e: EscritorioParaQualificar): string {
  const nome = limpo(e.razaoSocial) ?? e.nome;
  const partes = [
    "pessoa juridica de direito privado",
    limpo(e.cnpj) ? `inscrita no CNPJ sob o nº ${formatarDocumento(e.cnpj!)}` : null,
    limpo(e.registroOab)
      ? `com Registro de Sociedade de Advocacia nº ${e.registroOab!.trim()} junto a Ordem dos Advogados do Brasil`
      : null,
  ].filter(Boolean);

  const endereco = enderecoEmLinha(sedeDe(e.enderecos));
  if (endereco) partes.push(`com sede a ${endereco}`);
  else if (limpo(e.cidade)) partes.push(`com atendimento em ${e.cidade!.trim()}`);

  return partes.length > 0 ? `${nome}, ${partes.join(", ")}` : nome;
}

/**
 * A qualificacao vai no feminino?
 *
 * Pela nacionalidade e pelo estado civil que a propria pessoa cadastrou:
 * "brasileira", "casada", "solteira", "viuva". Quem escreveu assim esta
 * dizendo como quer ser tratada, e a peca precisa concordar — "Ana Paula
 * Martins, brasileira, casada, advogado, inscrito na OAB" e um erro que salta
 * aos olhos de quem assina.
 *
 * Nao se adivinha pelo NOME: nome nao diz genero, e errar o genero de alguem
 * em um documento que ela assina e pior do que escrever no masculino por falta
 * de dado. Sem nacionalidade nem estado civil preenchidos, fica no masculino,
 * que e a forma do cargo em lei.
 */
function ehFeminino(a: AdvogadoParaQualificar): boolean {
  const pistas = [limpo(a.nacionalidade), limpo(a.estadoCivil)].filter(Boolean) as string[];
  return pistas.some((p) => /a$/i.test(p.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
}

/**
 * O advogado, por extenso.
 *
 * Quando ele tem sociedade unipessoal propria — comum em banca de dois socios
 * — a sociedade vem primeiro e ele aparece como quem a representa, que e como
 * o contrato precisa dizer: quem se obriga e a sociedade.
 */
export function qualificacaoDoAdvogado(a: AdvogadoParaQualificar): string {
  const f = ehFeminino(a);
  const pessoa = [
    limpo(a.nacionalidade),
    limpo(a.estadoCivil),
    f ? "advogada" : "advogado",
    limpo(a.oab) ? `${f ? "inscrita" : "inscrito"} na OAB sob o nº ${a.oab!.trim()}` : null,
    limpo(a.cpf) ? `${f ? "portadora" : "portador"} do CPF nº ${formatarDocumento(a.cpf!)}` : null,
    limpo(a.rg) ? `e do RG nº ${a.rg!.trim()}` : null,
  ].filter(Boolean);

  const dele = `${a.nome}, ${pessoa.join(", ")}`;

  const sociedade = limpo(a.sociedade);
  if (!sociedade) return dele;

  const daSociedade = [
    "pessoa juridica de direito privado",
    limpo(a.sociedadeCnpj)
      ? `inscrita no CNPJ sob o nº ${formatarDocumento(a.sociedadeCnpj!)}`
      : null,
  ].filter(Boolean);

  return `${sociedade}, ${daSociedade.join(", ")}, ${f ? "representada" : "representado"} por ${dele}`;
}

/** Todos os que assinam, em um paragrafo so. */
export function qualificacaoDosAdvogados(
  advogados: AdvogadoParaQualificar[],
): string {
  const textos = advogados.map(qualificacaoDoAdvogado);
  if (textos.length === 0) return "";
  if (textos.length === 1) return textos[0];
  return `${textos.slice(0, -1).join("; ")} e ${textos[textos.length - 1]}`;
}

/**
 * As linhas de assinatura, como saem no pe da peca.
 *
 * Uma linha por advogado, com o nome e a OAB embaixo — do jeito que se assina
 * em papel.
 */
export function linhasDeAssinatura(
  advogados: AdvogadoParaQualificar[],
): Array<{ nome: string; oab: string | null }> {
  return advogados.map((a) => ({
    nome: a.nome.toUpperCase(),
    oab: limpo(a.oab) ? `OAB ${a.oab!.trim()}` : null,
  }));
}

/**
 * "Guariba/SP, 7 de outubro de 2026" — o fecho da peca.
 *
 * A cidade e a do escritorio. Sem cidade cadastrada sai so a data: inventar a
 * comarca de alguem e pior que a peca sair com um campo a menos.
 */
const MES = [
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function cidadeEData(cidade: string | null | undefined, quando: Date): string {
  const data = `${quando.getUTCDate()} de ${MES[quando.getUTCMonth()]} de ${quando.getUTCFullYear()}`;
  const onde = limpo(cidade);
  return onde ? `${onde}, ${data}` : data;
}
