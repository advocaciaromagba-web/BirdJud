// Modelo de documento: o papel do escritorio, preenchido com os dados.
//
// O escritorio envia o .docx dele — com o timbre, a fonte e o texto que o
// advogado escreveu e assina — e o sistema troca so os campos marcados. Nada
// de reescrever a peca do escritorio em um gerador nosso: a peca e dele.
//
// Este arquivo nao toca disco nem banco. Trabalha sobre o XML de dentro do
// .docx, e e por isso que cada armadilha abaixo da para testar sozinha.

/** Como o campo e escrito no modelo: {{cliente.nome}}. */
const MARCA = /\{\{\s*([a-z0-9_.]+)\s*\}\}/gi;

export const ESPECIES = ["CONTRATO", "PROCURACAO", "DECLARACAO", "RECIBO"] as const;
export type Especie = (typeof ESPECIES)[number];

export const NOME_DA_ESPECIE: Record<Especie, string> = {
  CONTRATO: "Contrato de honorarios",
  PROCURACAO: "Procuracao",
  DECLARACAO: "Declaracao de hipossuficiencia",
  RECIBO: "Recibo de pagamento de honorarios",
};

/**
 * Os campos que o modelo pode usar.
 *
 * Esta lista e o contrato com o escritorio: o que esta aqui, o sistema
 * preenche; o que nao esta, ele avisa no envio em vez de deixar para a peca
 * descobrir na frente do cliente.
 */
export const CAMPOS: Array<{ chave: string; sobre: string }> = [
  { chave: "cliente.nome", sobre: "Nome do cliente" },
  { chave: "cliente.qualificacao", sobre: "Qualificacao completa, como vai na peca" },
  { chave: "cliente.documento", sobre: "CPF ou CNPJ, com pontuacao" },
  { chave: "cliente.endereco", sobre: "Endereco em uma linha" },
  { chave: "cliente.email", sobre: "E-mail do cliente" },
  { chave: "cliente.telefone", sobre: "Telefone do cliente" },
  { chave: "representante.qualificacao", sobre: "Quem assina pela pessoa juridica" },
  { chave: "escritorio.nome", sobre: "Nome do escritorio" },
  { chave: "escritorio.cidade", sobre: "Cidade do escritorio" },
  { chave: "escritorio.telefone", sobre: "Telefone de atendimento" },
  { chave: "processo.numero", sobre: "Numero unico do processo" },
  { chave: "processo.vara", sobre: "Vara" },
  { chave: "processo.tribunal", sobre: "Tribunal" },
  { chave: "honorarios.valor", sobre: "Valor dos honorarios, em reais" },
  { chave: "honorarios.valor_por_extenso", sobre: "O mesmo valor escrito por extenso" },
  { chave: "honorarios.parcelas", sobre: "Quantas parcelas" },
  { chave: "honorarios.parcela_valor", sobre: "Valor de cada parcela" },
  { chave: "honorarios.percentual", sobre: "Percentual de exito" },
  { chave: "honorarios.descricao", sobre: "Sobre o que sao os honorarios" },
  { chave: "honorarios.primeiro_vencimento", sobre: "Data da primeira parcela" },
  { chave: "honorarios.contratacao", sobre: "Como foi contratado: a vista, 3x, entrada mais 3x..." },
  { chave: "honorarios.entrada", sobre: "Valor da entrada, quando ha" },
  { chave: "honorarios.forma", sobre: "Boleto, Pix, cartao ou o cliente escolhe" },
  { chave: "recibo.valor", sobre: "Valor recebido, para o recibo" },
  { chave: "recibo.valor_por_extenso", sobre: "O mesmo valor escrito por extenso" },
  { chave: "recibo.referente_a", sobre: "A que se refere o pagamento" },
  { chave: "recibo.forma", sobre: "Como foi pago: Pix, boleto, cartao, dinheiro" },
  { chave: "recibo.data", sobre: "Data do pagamento" },
  { chave: "data.hoje", sobre: "Data de hoje, por extenso" },
  { chave: "data.cidade_e_data", sobre: "Cidade e data, para fechar a peca" },
];

export const CHAVES_CONHECIDAS = new Set(CAMPOS.map((c) => c.chave));

/**
 * O que aparece no lugar de um campo que o sistema conhece mas nao tem valor.
 *
 * Deixar em branco seria o pior resultado possivel: a peca sai com um buraco
 * onde deveria estar o valor dos honorarios e ninguem ve. Preenchido assim,
 * salta aos olhos de quem conferir antes de assinar.
 */
export const SEM_VALOR = "[ --- ]";

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function desescaparXml(texto: string): string {
  return texto
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Cada pedaco de texto do XML, com onde ele comeca e termina. */
type Pedaco = { inicio: number; fim: number; texto: string };

const NO_DE_TEXTO = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;

function pedacosDe(xml: string): Pedaco[] {
  const achados: Pedaco[] = [];
  NO_DE_TEXTO.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NO_DE_TEXTO.exec(xml)) !== null) {
    const abertura = m[0].length - m[1].length - "</w:t>".length;
    achados.push({
      inicio: m.index + abertura,
      fim: m.index + abertura + m[1].length,
      texto: m[1],
    });
  }
  return achados;
}

/**
 * Os paragrafos do documento, cada um com a faixa que ocupa no XML.
 *
 * O preenchimento e por paragrafo, nao pelo documento inteiro: um "{{" que
 * sobrou no fim de um paragrafo nao pode casar com um "}}" de outro e comer o
 * texto do meio.
 */
function paragrafosDe(xml: string): Array<{ inicio: number; fim: number }> {
  const faixas: Array<{ inicio: number; fim: number }> = [];
  const abre = /<w:p(?:\s[^>]*)?>/g;
  let m: RegExpExecArray | null;
  while ((m = abre.exec(xml)) !== null) {
    const fim = xml.indexOf("</w:p>", m.index);
    if (fim === -1) continue;
    faixas.push({ inicio: m.index, fim });
  }
  return faixas;
}

export type Preenchimento = {
  xml: string;
  /** Campos conhecidos que ficaram sem valor. */
  semValor: string[];
  /** Campos escritos no modelo que o sistema nao conhece. */
  desconhecidos: string[];
};

/**
 * Troca os campos do modelo pelos valores.
 *
 * A ARMADILHA que este codigo existe para resolver: o Word quebra uma palavra
 * em varios `<w:r>` sem avisar — basta alguem ter passado o corretor
 * ortografico. Entao `{{cliente.nome}}` vira, no arquivo, algo como
 * `{{cli` + `ente.` + `nome}}`, e qualquer troca ingenua nao acha nada e sai
 * calada, com a peca inteira errada. Por isso o texto do paragrafo e juntado
 * antes de procurar, e o resultado e devolvido pedaco a pedaco.
 *
 * Campo que o sistema nao conhece fica escrito como esta, de proposito: um
 * campo digitado errado tem de aparecer na peca, nao sumir.
 */
export function preencher(
  xml: string,
  valores: Record<string, string | null | undefined>,
): Preenchimento {
  const semValor = new Set<string>();
  const desconhecidos = new Set<string>();

  const pedacos = pedacosDe(xml);
  const paragrafos = paragrafosDe(xml);
  // Trocas acumuladas, por faixa do XML, aplicadas de tras para frente para
  // que um recorte nao desloque o proximo.
  const trocas: Array<{ inicio: number; fim: number; texto: string }> = [];

  for (const p of paragrafos) {
    const meus = pedacos.filter((t) => t.inicio >= p.inicio && t.fim <= p.fim);
    if (meus.length === 0) continue;

    const junto = meus.map((t) => desescaparXml(t.texto)).join("");
    if (!junto.includes("{{")) continue;

    // Onde cada pedaco comeca dentro do texto juntado.
    const inicios: number[] = [];
    let soma = 0;
    for (const t of meus) {
      inicios.push(soma);
      soma += desescaparXml(t.texto).length;
    }

    const novoTexto = junto.replace(MARCA, (inteiro, chave: string) => {
      const nome = String(chave).toLowerCase();
      if (!CHAVES_CONHECIDAS.has(nome)) {
        desconhecidos.add(nome);
        return inteiro;
      }
      const valor = valores[nome];
      if (valor === null || valor === undefined || valor.trim() === "") {
        semValor.add(nome);
        return SEM_VALOR;
      }
      return valor;
    });

    if (novoTexto === junto) continue;

    // Tudo no primeiro pedaco; os outros ficam vazios. A formatacao que vale
    // e a do primeiro — e a do campo, que e o que o escritorio formatou.
    trocas.push({ inicio: meus[0].inicio, fim: meus[0].fim, texto: escaparXml(novoTexto) });
    for (const t of meus.slice(1)) {
      trocas.push({ inicio: t.inicio, fim: t.fim, texto: "" });
    }
  }

  trocas.sort((a, b) => b.inicio - a.inicio);
  let saida = xml;
  for (const t of trocas) {
    saida = saida.slice(0, t.inicio) + t.texto + saida.slice(t.fim);
  }

  return {
    xml: saida,
    semValor: [...semValor].sort(),
    desconhecidos: [...desconhecidos].sort(),
  };
}

/**
 * Quais campos o modelo usa — para conferir no envio, nao na hora da peca.
 *
 * Le o texto juntado por paragrafo pelo mesmo motivo de sempre: o Word parte
 * o campo no meio, e um conferidor ingenuo diria "nenhum campo" para um
 * modelo cheio deles.
 */
export function camposDoModelo(xml: string): {
  usados: string[];
  desconhecidos: string[];
} {
  const usados = new Set<string>();
  const desconhecidos = new Set<string>();
  const pedacos = pedacosDe(xml);

  for (const p of paragrafosDe(xml)) {
    const junto = pedacos
      .filter((t) => t.inicio >= p.inicio && t.fim <= p.fim)
      .map((t) => desescaparXml(t.texto))
      .join("");
    MARCA.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MARCA.exec(junto)) !== null) {
      const nome = m[1].toLowerCase();
      if (CHAVES_CONHECIDAS.has(nome)) usados.add(nome);
      else desconhecidos.add(nome);
    }
  }

  return { usados: [...usados].sort(), desconhecidos: [...desconhecidos].sort() };
}

/** Texto corrido do documento, so para a previa na tela. */
export function textoDoDocumento(xml: string): string {
  const pedacos = pedacosDe(xml);
  return paragrafosDe(xml)
    .map((p) =>
      pedacos
        .filter((t) => t.inicio >= p.inicio && t.fim <= p.fim)
        .map((t) => desescaparXml(t.texto))
        .join(""),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
