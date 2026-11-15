// Completar o cadastro do cliente pelos documentos que ja estao guardados
// (15/11/2026, vindo do sistema da Advocacia Roma). Puro: nada aqui toca
// banco, disco nem IA — sao as travas, e por isso tem teste.
//
// Estes dados vao para procuracao e contrato novos. Quatro travas:
//   1. so preenche campo VAZIO: entre o que alguem digitou e o que a IA leu,
//      o sistema nao escolhe sozinho;
//   2. confere que os documentos sao do cliente (nome e, havendo dos dois
//      lados, CPF/CNPJ);
//   3. ignora os advogados, que aparecem nos mesmos papeis (na instrucao);
//   4. leitura com duvida nao entra.
import { cnpjValido, cpfValido, digitosDe, formatarDocumento } from "./documentos";
import type { Leitura } from "./leitura-documento";

export const CAMPOS_COMPLETAVEIS = ["documento", "rg", "nascimento", "nacionalidade", "estadoCivil", "profissao", "endereco"] as const;
export type CampoCompletavel = (typeof CAMPOS_COMPLETAVEIS)[number];

export const ROTULO_DO_CAMPO: Record<CampoCompletavel, string> = {
  documento: "CPF / CNPJ",
  rg: "RG",
  nascimento: "nascimento",
  nacionalidade: "nacionalidade",
  estadoCivil: "estado civil",
  profissao: "profissão",
  endereco: "endereço",
};

export type ClienteParaCompletar = {
  nome: string;
  documento: string | null;
  rg: string | null;
  nascimento: Date | null;
  nacionalidade: string | null;
  estadoCivil: string | null;
  profissao: string | null;
  endereco: unknown;
};

const vazio = (v: string | null | undefined) => !v || !v.trim();

function enderecoIncompleto(endereco: unknown): boolean {
  const e = (endereco ?? {}) as Record<string, string | null | undefined>;
  return vazio(e.logradouro ?? e.rua) || vazio(e.cidade);
}

/**
 * O que falta no cadastro para a procuracao e o contrato sairem inteiros.
 * Empresa (CNPJ) nao tem RG, nascimento nem estado civil: so o endereco.
 */
export function camposFaltando(c: ClienteParaCompletar): CampoCompletavel[] {
  const empresa = digitosDe(c.documento ?? "").length === 14;
  const falta: CampoCompletavel[] = [];
  if (vazio(c.documento)) falta.push("documento");
  if (!empresa) {
    if (vazio(c.rg)) falta.push("rg");
    if (!c.nascimento) falta.push("nascimento");
    if (vazio(c.nacionalidade)) falta.push("nacionalidade");
    if (vazio(c.estadoCivil)) falta.push("estadoCivil");
    if (vazio(c.profissao)) falta.push("profissao");
  }
  if (enderecoIncompleto(c.endereco)) falta.push("endereco");
  return falta;
}

/** Sem acento, em maiusculas, so letras e espaco: "João d'Ávila" = "JOAO D AVILA". */
function nomeChato(nome: string): string[] {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]+/g, " ")
    .split(/\s+/)
    // "de", "da", "dos" somem e voltam de um documento para o outro.
    .filter((p) => p && !["DE", "DA", "DO", "DAS", "DOS", "E"].includes(p));
}

/** O nome lido e o do cadastro sao da mesma pessoa? Abreviacao do meio passa; homonimo parcial, nao. */
export function mesmoNome(cadastro: string, lido: string): boolean {
  const a = nomeChato(cadastro);
  const b = nomeChato(lido);
  if (a.length === 0 || b.length === 0) return false;
  if (a.join(" ") === b.join(" ")) return true;
  // Um e o outro com um nome do meio a menos: primeiro e ultimo iguais, e o
  // menor inteiro dentro do maior, com pelo menos dois nomes.
  const [menor, maior] = a.length <= b.length ? [a, b] : [b, a];
  if (menor.length < 2) return false;
  if (menor[0] !== maior[0] || menor[menor.length - 1] !== maior[maior.length - 1]) return false;
  const tem = new Set(maior);
  return menor.every((p) => tem.has(p));
}

/**
 * Por que estes documentos NAO sao deste cliente — ou null, se sao.
 * Pasta com o RG do conjuge ou o contrato de um homonimo nao preenche nada.
 */
export function motivoDeNaoSerDoCliente(c: Pick<ClienteParaCompletar, "nome" | "documento">, leitura: Leitura): string | null {
  const nomeLido = leitura.campos.nome?.valor?.trim();
  if (!nomeLido) return "A leitura não trouxe o nome de quem é o documento, e sem isso não dá para saber se é deste cliente.";
  if (!mesmoNome(c.nome, nomeLido)) {
    return `Os documentos estão em nome de "${nomeLido}", que não confere com o cadastro ("${c.nome}"). Nada foi preenchido.`;
  }
  const doCadastro = digitosDe(c.documento ?? "");
  const lido = digitosDe(leitura.campos.documento?.valor ?? "");
  if (doCadastro && lido && doCadastro !== lido) {
    return "O CPF/CNPJ dos documentos é diferente do que está no cadastro: pode ser um homônimo. Nada foi preenchido.";
  }
  return null;
}

export type Decisao = {
  /** Campo do cadastro -> valor que entra. `endereco` entra como objeto. */
  preencher: Partial<Record<Exclude<CampoCompletavel, "endereco">, string>> & { endereco?: Record<string, string> };
  /** De onde saiu cada um, nas palavras da leitura. */
  origem: Partial<Record<CampoCompletavel, string>>;
  /** Lido, mas nao entrou — e por que. */
  recusados: { campo: CampoCompletavel; motivo: string }[];
};

const CAMPOS_DO_ENDERECO = ["cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf"] as const;

/** O que entra no cadastro. So o que falta, e so o que foi lido sem duvida. */
export function decidirPreenchimento(c: ClienteParaCompletar, leitura: Leitura, hoje = new Date()): Decisao {
  const d: Decisao = { preencher: {}, origem: {}, recusados: [] };
  const falta = new Set(camposFaltando(c));
  const lido = leitura.campos;

  for (const campo of ["documento", "rg", "nascimento", "nacionalidade", "estadoCivil", "profissao"] as const) {
    // Trava 1: campo que ja tem valor nao e tocado, nem para "corrigir".
    if (!falta.has(campo)) continue;
    const l = lido[campo];
    const valor = l?.valor?.trim();
    if (!l || !valor) continue;
    // Marcador que o proprio gerador de pecas escreve quando falta o dado:
    // lido de volta de um contrato antigo, nao e valor.
    if (/N[AÃ]O\s+INFORMAD/i.test(valor) || /^\[.*\]$/.test(valor)) continue;
    if (l.confianca === "BAIXA") {
      d.recusados.push({ campo, motivo: "a leitura veio com dúvida (documento borrado, cortado ou ambíguo)" });
      continue;
    }
    if (campo === "documento") {
      if (!cpfValido(valor) && !cnpjValido(valor)) {
        d.recusados.push({ campo, motivo: "o número lido não fecha no dígito verificador" });
        continue;
      }
      d.preencher.documento = formatarDocumento(valor);
    } else if (campo === "nascimento") {
      const data = new Date(`${valor}T00:00:00Z`);
      if (Number.isNaN(data.getTime()) || data.getUTCFullYear() < 1900 || data.getTime() > hoje.getTime()) {
        d.recusados.push({ campo, motivo: "a data lida não é uma data de nascimento possível" });
        continue;
      }
      d.preencher.nascimento = valor;
    } else {
      d.preencher[campo] = valor;
    }
    if (l.origem) d.origem[campo] = l.origem;
  }

  if (falta.has("endereco")) {
    const partes = CAMPOS_DO_ENDERECO.map((k) => [k, lido[k]] as const).filter(([, l]) => l?.valor?.trim());
    if (partes.length) {
      const temDuvida = partes.some(([k, l]) => l!.confianca === "BAIXA" && (k === "logradouro" || k === "cidade" || k === "uf" || k === "numero"));
      const tem = (k: string) => partes.some(([p]) => p === k);
      if (temDuvida) {
        d.recusados.push({ campo: "endereco", motivo: "o endereço veio com dúvida na leitura" });
      } else if (!tem("logradouro") || !tem("cidade") || !tem("uf")) {
        // Meio endereco e pior que nenhum: sai na procuracao como se fosse inteiro.
        d.recusados.push({ campo: "endereco", motivo: "o endereço não veio inteiro (falta rua, cidade ou UF)" });
      } else {
        const endereco: Record<string, string> = {};
        for (const [k, l] of partes) endereco[k] = k === "cep" ? digitosDe(l!.valor) : l!.valor.trim();
        d.preencher.endereco = endereco;
        const origem = lido.logradouro?.origem;
        if (origem) d.origem.endereco = origem;
      }
    }
  }
  return d;
}

/** O que a IA precisa saber A MAIS quando le a pasta inteira de um cliente ja cadastrado. */
export function instrucaoDaPasta(nomeDoCliente: string): string {
  return [
    "",
    `Estes arquivos estão guardados na pasta do cliente "${nomeDoCliente}". Extraia os dados DESTA pessoa, e só dela:`,
    "- no RG, CIN ou CNH ela é o titular; na procuração é o OUTORGANTE; no contrato de honorários é o CONTRATANTE; na declaração é o DECLARANTE;",
    "- IGNORE os advogados e o escritório (outorgados, contratados): a qualificação e o endereço deles aparecem nos mesmos papéis e não são do cliente;",
    "- IGNORE por inteiro o documento que for de outra pessoa (cônjuge, filho, parte contrária, testemunha);",
    '- texto entre colchetes dizendo que o dado não foi informado ("[RG NÃO INFORMADO(A)]") não é valor: não devolva o campo;',
    "- se o comprovante de endereço estiver em nome de OUTRA pessoa, NÃO devolva os campos de endereço, e diga em observações de quem é a conta (esta regra vale no lugar da regra geral sobre comprovante de terceiro);",
    '- "nome" é o nome completo do titular como está no documento: é o que permite conferir de quem são os papéis. Devolva sempre que estiver legível;',
    '- em "origem", diga o nome do arquivo de onde saiu cada dado.',
  ].join("\n");
}
