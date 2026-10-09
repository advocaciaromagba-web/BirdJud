// Importacao de clientes por planilha: a regra, sem banco.
//
// A planilha vem de um sistema que nao conhecemos. Tres decisoes guiam tudo:
//
// 1. NA DUVIDA, NAO GRAVA. Linha com CPF que nao fecha, ou com numero que o
//    Excel destruiu (notacao cientifica), vai para o relatorio com o motivo —
//    nunca entra "consertada" por chute. Cadastro errado segue para a peca, a
//    cobranca e a nota fiscal.
// 2. UNICA EXCECAO, conferida: CPF, CNPJ ou CEP que vieram como NUMERO e
//    perderam o zero da frente. O zero e devolvido SO se o documento entao
//    fechar o digito verificador (para CEP, so se ficar com 8 digitos), e a
//    linha leva um aviso dizendo isso.
// 3. CAMPO ACESSORIO RUIM NAO DERRUBA O CLIENTE. E-mail sem @, telefone
//    curto, data impossivel: o campo fica de fora, com aviso, e o cliente
//    entra. So o nome e o documento invalido barram.
import { documentoValido, formatarDocumento } from "./documentos";
import { digitos, normalizarNome } from "./duplicados";
import { UFS } from "./ufs";
import type { Celula } from "./planilha";

export const CAMPOS_IMPORTAVEIS = [
  { chave: "nome", rotulo: "Nome / razao social", sinonimos: ["nome", "nome completo", "cliente", "nome do cliente", "razao social", "nome razao social", "nome ou razao social", "nome cliente"] },
  { chave: "documento", rotulo: "CPF / CNPJ", sinonimos: ["cpf", "cnpj", "cpf cnpj", "cnpj cpf", "documento", "cpf ou cnpj", "doc", "n documento", "numero documento", "cpf do cliente"] },
  { chave: "email", rotulo: "E-mail", sinonimos: ["email", "e mail", "correio eletronico", "endereco eletronico", "email do cliente"] },
  { chave: "telefone", rotulo: "Telefone / celular", sinonimos: ["telefone", "celular", "fone", "tel", "whatsapp", "telefone celular", "telefone 1", "fone 1", "contato", "celular 1", "telefone principal"] },
  { chave: "rg", rotulo: "RG", sinonimos: ["rg", "identidade", "n rg", "numero rg", "rg numero", "documento de identidade", "carteira de identidade"] },
  { chave: "nascimento", rotulo: "Data de nascimento", sinonimos: ["nascimento", "data de nascimento", "data nascimento", "dt nascimento", "nasc", "data nasc", "dt nasc"] },
  { chave: "nacionalidade", rotulo: "Nacionalidade", sinonimos: ["nacionalidade"] },
  { chave: "estadoCivil", rotulo: "Estado civil", sinonimos: ["estado civil", "est civil"] },
  { chave: "profissao", rotulo: "Profissao", sinonimos: ["profissao", "ocupacao", "cargo"] },
  { chave: "cep", rotulo: "CEP", sinonimos: ["cep", "codigo postal"] },
  { chave: "logradouro", rotulo: "Rua / logradouro", sinonimos: ["logradouro", "rua", "avenida", "endereco rua", "rua avenida"] },
  { chave: "numero", rotulo: "Numero (endereco)", sinonimos: ["numero", "n", "no", "num", "nro", "numero endereco"] },
  { chave: "complemento", rotulo: "Complemento", sinonimos: ["complemento", "compl"] },
  { chave: "bairro", rotulo: "Bairro", sinonimos: ["bairro"] },
  { chave: "cidade", rotulo: "Cidade", sinonimos: ["cidade", "municipio"] },
  { chave: "uf", rotulo: "UF", sinonimos: ["uf", "estado", "sigla uf"] },
  { chave: "enderecoCompleto", rotulo: "Endereco completo (uma coluna)", sinonimos: ["endereco", "endereco completo", "endereco residencial"] },
  { chave: "observacoes", rotulo: "Observacoes", sinonimos: ["observacoes", "observacao", "obs", "anotacoes", "notas"] },
] as const;

export type CampoImportavel = (typeof CAMPOS_IMPORTAVEIS)[number]["chave"];
/** Para cada coluna da planilha, o campo do sistema (ou null = ignorar). */
export type Mapeamento = (CampoImportavel | null)[];

export function ehCampoImportavel(v: unknown): v is CampoImportavel {
  return CAMPOS_IMPORTAVEIS.some((c) => c.chave === v);
}

/** "Nº do CPF/CNPJ:" -> "n do cpf cnpj" */
export function normalizarCabecalho(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/º|ª/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * O mapeamento sugerido: nome igual a um sinonimo vale mais que nome que so
 * contem a palavra. Cada campo vai para uma coluna so — a de melhor nota, e
 * na empate a primeira. Quem importa confere e corrige na tela.
 */
export function sugerirMapeamento(cabecalho: string[]): Mapeamento {
  const notas: { coluna: number; campo: CampoImportavel; nota: number }[] = [];
  cabecalho.forEach((titulo, coluna) => {
    const n = normalizarCabecalho(titulo);
    if (!n) return;
    for (const c of CAMPOS_IMPORTAVEIS) {
      let nota = 0;
      for (const s of c.sinonimos) {
        if (n === s) nota = Math.max(nota, 3);
        else if (s.length >= 3 && (` ${n} `.includes(` ${s} `))) nota = Math.max(nota, 1 + s.length / 100);
      }
      if (nota > 0) notas.push({ coluna, campo: c.chave, nota });
    }
  });
  notas.sort((a, b) => b.nota - a.nota || a.coluna - b.coluna);
  const mapa: Mapeamento = cabecalho.map(() => null);
  const usados = new Set<CampoImportavel>();
  for (const x of notas) {
    if (mapa[x.coluna] || usados.has(x.campo)) continue;
    mapa[x.coluna] = x.campo;
    usados.add(x.campo);
  }
  return mapa;
}

export type ClienteImportado = {
  nome: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  rg: string | null;
  nascimento: string | null; // AAAA-MM-DD
  nacionalidade: string | null;
  estadoCivil: string | null;
  profissao: string | null;
  observacoes: string | null;
  endereco: Record<string, string> | null;
};

export type LinhaInterpretada = {
  dados: ClienteImportado;
  problemas: string[];
  avisos: string[];
  vazia: boolean;
};

const DOC_CIENTIFICO =
  "o Excel transformou o numero em notacao cientifica e os digitos se perderam. Formate a coluna como Texto no sistema de origem e exporte de novo";

/**
 * CPF/CNPJ. Celula de NUMERO com 9-10 ou 12-13 digitos: tenta devolver os
 * zeros da frente, e so aceita se o documento entao fechar o digito.
 */
export function lerDocumento(c: Celula | undefined): { valor: string | null; problema?: string; aviso?: string } {
  if (!c || !c.texto) return { valor: null };
  if (c.cientifica) return { valor: null, problema: `CPF/CNPJ: ${DOC_CIENTIFICO}` };
  const d = digitos(c.texto);
  if (d.length === 11 || d.length === 14) {
    return documentoValido(d)
      ? { valor: formatarDocumento(d) }
      : { valor: null, problema: `CPF/CNPJ ${c.texto} nao fecha o digito verificador` };
  }
  if (c.numero && (d.length === 9 || d.length === 10 || d.length === 12 || d.length === 13)) {
    const alvo = d.length <= 10 ? 11 : 14;
    const completo = d.padStart(alvo, "0");
    if (documentoValido(completo)) {
      return {
        valor: formatarDocumento(completo),
        aviso: `o Excel tinha tirado o zero da frente do ${alvo === 11 ? "CPF" : "CNPJ"}: devolvido e conferido pelo digito`,
      };
    }
  }
  return { valor: null, problema: `CPF/CNPJ ${c.texto} tem ${d.length} digito(s): nao e CPF (11) nem CNPJ (14)` };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function lerTelefone(texto: string): string | null {
  let d = digitos(texto);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return null;
}

/** dd/mm/aaaa, dd-mm-aaaa, dd.mm.aaaa, aaaa-mm-dd, ou numero de serie do Excel. */
export function lerData(c: Celula | undefined, hoje = new Date()): string | null {
  if (!c || !c.texto) return null;
  let a: number, m: number, d: number;
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(c.texto);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(c.texto);
  if (iso) [a, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (br) {
    d = Number(br[1]);
    m = Number(br[2]);
    a = Number(br[3]);
    // Ano com dois digitos: 19xx se passar do ano corrente.
    if (a < 100) a += a > hoje.getFullYear() % 100 ? 1900 : 2000;
  } else if (c.numero && /^\d{4,5}$/.test(c.texto)) {
    const serie = Number(c.texto);
    const ms = (serie - 25569) * 86400000;
    const dt = new Date(ms);
    [a, m, d] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  } else return null;
  const data = new Date(Date.UTC(a, m - 1, d));
  if (data.getUTCMonth() !== m - 1 || data.getUTCDate() !== d) return null;
  if (a < 1900 || data.getTime() > hoje.getTime()) return null;
  return data.toISOString().slice(0, 10);
}

const limitar = (t: string, n: number) => (t.length > n ? t.slice(0, n) : t);

export function interpretarLinha(celulas: Celula[], mapa: Mapeamento, hoje = new Date()): LinhaInterpretada {
  const de = (campo: CampoImportavel): Celula | undefined => {
    const i = mapa.indexOf(campo);
    return i >= 0 ? celulas[i] : undefined;
  };
  const txt = (campo: CampoImportavel, max = 200) => {
    const v = de(campo)?.texto.replace(/\s+/g, " ").trim();
    return v ? limitar(v, max) : null;
  };
  const problemas: string[] = [];
  const avisos: string[] = [];

  const vazia = mapa.every((campo, i) => !campo || !celulas[i]?.texto);

  const nome = txt("nome");
  if (!nome || nome.length < 2) problemas.push("sem nome");

  const doc = lerDocumento(de("documento"));
  if (doc.problema) problemas.push(doc.problema);
  if (doc.aviso) avisos.push(doc.aviso);

  let email = txt("email")?.toLowerCase() ?? null;
  if (email && !EMAIL.test(email)) {
    avisos.push(`e-mail "${email}" invalido: ficou de fora`);
    email = null;
  }

  let telefone: string | null = null;
  const telBruto = txt("telefone");
  if (telBruto) {
    telefone = lerTelefone(telBruto);
    if (!telefone) avisos.push(`telefone "${telBruto}" sem DDD ou incompleto: ficou de fora`);
  }

  let rg = txt("rg", 30);
  if (rg && de("rg")?.cientifica) {
    avisos.push("RG em notacao cientifica: ficou de fora");
    rg = null;
  }

  let nascimento: string | null = null;
  if (txt("nascimento")) {
    nascimento = lerData(de("nascimento"), hoje);
    if (!nascimento) avisos.push(`data de nascimento "${txt("nascimento")}" nao e uma data valida: ficou de fora`);
  }

  // Endereco
  const endereco: Record<string, string> = {};
  const cepCel = de("cep");
  if (cepCel?.texto) {
    let cep = digitos(cepCel.texto);
    if (cepCel.numero && cep.length === 7) {
      cep = cep.padStart(8, "0");
      avisos.push("o Excel tinha tirado o zero da frente do CEP: devolvido");
    }
    if (cep.length === 8) endereco.cep = cep;
    else avisos.push(`CEP "${cepCel.texto}" incompleto: ficou de fora`);
  }
  const rua = txt("logradouro") ?? txt("enderecoCompleto", 300);
  if (rua) {
    endereco.logradouro = rua;
    endereco.rua = rua;
  }
  for (const parte of ["numero", "complemento", "bairro", "cidade"] as const) {
    const v = txt(parte, 120);
    if (v) endereco[parte] = v;
  }
  const uf = txt("uf")?.toUpperCase();
  if (uf) {
    if ((UFS as readonly string[]).includes(uf)) endereco.uf = uf;
    else avisos.push(`UF "${uf}" nao e sigla de estado: ficou de fora`);
  }

  return {
    vazia,
    problemas: vazia ? [] : problemas,
    avisos: vazia ? [] : avisos,
    dados: {
      nome: nome ?? "",
      documento: doc.valor,
      email,
      telefone,
      rg,
      nascimento,
      nacionalidade: txt("nacionalidade", 60),
      estadoCivil: txt("estadoCivil", 60),
      profissao: txt("profissao", 120),
      observacoes: txt("observacoes", 4000),
      endereco: Object.keys(endereco).length ? endereco : null,
    },
  };
}

export type Situacao = "NOVO" | "JA_CADASTRADO" | "REPETIDO_NA_PLANILHA" | "PROBLEMA" | "VAZIA";

export const ROTULO_DA_SITUACAO: Record<Situacao, string> = {
  NOVO: "Novo",
  JA_CADASTRADO: "Ja cadastrado",
  REPETIDO_NA_PLANILHA: "Repetido na planilha",
  PROBLEMA: "Com problema",
  VAZIA: "Linha vazia",
};

export type LinhaClassificada = LinhaInterpretada & {
  /** Numero da linha na planilha, como o Excel mostra. */
  linha: number;
  situacao: Situacao;
  motivo: string | null;
};

export type Existentes = {
  /** Documentos ja cadastrados, so digitos. */
  documentos: Set<string>;
  /** Nomes normalizados de clientes SEM documento. */
  nomesSemDocumento: Set<string>;
  /** Nomes normalizados de todos os clientes. */
  nomes: Set<string>;
};

/**
 * Quem ja existe: pelo documento, sempre. Sem documento na planilha, pelo
 * nome — homonimo sem documento e indistinguivel, e cadastrar duas vezes a
 * mesma pessoa e o erro que mais custa depois (cobranca em dobro, peca para
 * o cadastro errado).
 */
export function classificarLinhas(
  linhas: { numero: number; celulas: Celula[] }[],
  mapa: Mapeamento,
  existentes: Existentes,
  hoje = new Date(),
): LinhaClassificada[] {
  const vistosDoc = new Map<string, number>();
  const vistosNome = new Map<string, number>();
  return linhas.map(({ numero, celulas }) => {
    const l = interpretarLinha(celulas, mapa, hoje);
    const base = { ...l, linha: numero };
    if (l.vazia) return { ...base, situacao: "VAZIA" as const, motivo: null };
    if (l.problemas.length) return { ...base, situacao: "PROBLEMA" as const, motivo: l.problemas.join("; ") };

    const doc = digitos(l.dados.documento);
    const nome = normalizarNome(l.dados.nome);
    if (doc && existentes.documentos.has(doc)) {
      return { ...base, situacao: "JA_CADASTRADO" as const, motivo: "este CPF/CNPJ ja esta cadastrado" };
    }
    if (doc && existentes.nomesSemDocumento.has(nome)) {
      // Mesmo nome de um cliente cadastrado SEM CPF: provavelmente e ele.
      // Cadastrar de novo duplicaria; o caminho e completar o CPF na ficha.
      return { ...base, situacao: "JA_CADASTRADO" as const, motivo: "ja existe cliente com este nome, cadastrado sem CPF: complete o CPF na ficha dele" };
    }
    if (!doc && existentes.nomes.has(nome)) {
      return { ...base, situacao: "JA_CADASTRADO" as const, motivo: "ja existe cliente com este nome (a planilha nao traz CPF para diferenciar)" };
    }
    if (doc && vistosDoc.has(doc)) {
      return { ...base, situacao: "REPETIDO_NA_PLANILHA" as const, motivo: `mesmo CPF/CNPJ da linha ${vistosDoc.get(doc)}` };
    }
    if (!doc && vistosNome.has(nome)) {
      return { ...base, situacao: "REPETIDO_NA_PLANILHA" as const, motivo: `mesmo nome da linha ${vistosNome.get(nome)}, sem CPF para diferenciar` };
    }
    if (doc) vistosDoc.set(doc, numero);
    vistosNome.set(nome, vistosNome.get(nome) ?? numero);
    return { ...base, situacao: "NOVO" as const, motivo: null };
  });
}

export type Contagem = Record<Situacao, number>;

export function contar(linhas: LinhaClassificada[]): Contagem {
  const c: Contagem = { NOVO: 0, JA_CADASTRADO: 0, REPETIDO_NA_PLANILHA: 0, PROBLEMA: 0, VAZIA: 0 };
  for (const l of linhas) c[l.situacao] += 1;
  return c;
}
