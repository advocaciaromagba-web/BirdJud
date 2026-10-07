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
  { chave: "escritorio.qualificacao", sobre: "O escritorio por extenso: razao social, CNPJ, registro OAB e sede" },
  { chave: "escritorio.cnpj", sobre: "CNPJ do escritorio" },
  { chave: "escritorio.endereco", sobre: "Endereco da sede, em uma linha" },
  { chave: "advogados.qualificacao", sobre: "Os advogados que assinam, por extenso" },
  { chave: "advogados.assinaturas", sobre: "As linhas de assinatura, com nome e OAB" },
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
  // `<w:p/>` tambem e paragrafo: e assim que o Word — e este sistema, em
  // docx.ts — escreve a LINHA EM BRANCO entre uma clausula e a outra. Sem
  // reconhecer a forma fechada, quem desenha a peca junta o contrato inteiro em
  // um bloco unico e ninguem ve o erro no codigo, so no papel.
  const abre = /<w:p(?:\s[^>]*?)?(\/)?>/g;
  let m: RegExpExecArray | null;
  while ((m = abre.exec(xml)) !== null) {
    if (m[1]) {
      faixas.push({ inicio: m.index, fim: m.index + m[0].length });
      continue;
    }
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
    // Valor com quebra de linha — as linhas de assinatura, por exemplo —
    // precisa virar quebra DO WORD. Um "\n" solto dentro de <w:t> nao quebra
    // nada: o Word trata como espaco, e as tres assinaturas saem na mesma
    // linha, uma emendada na outra.
    const comQuebras = escaparXml(novoTexto).replace(
      /\n/g,
      '</w:t><w:br/><w:t xml:space="preserve">',
    );
    trocas.push({ inicio: meus[0].inicio, fim: meus[0].fim, texto: comQuebras });
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

// ---------------------------------------------------------------------------
// A estrutura do documento, para quem precisa desenhar e nao so ler
// ---------------------------------------------------------------------------

export type Alinhamento = "ESQUERDA" | "CENTRO" | "DIREITA" | "JUSTIFICADO";

/**
 * Um pedaco de texto com a formatacao que ele tem no Word.
 *
 * `espacos` e QUANTOS espacos vem antes deste pedaco, nao se vem algum. Zero
 * quer dizer colado no anterior — o Word reparte a palavra no meio de um
 * `<w:r>`, e "CLAUSULA" em negrito seguido de ":" sem negrito chega como dois
 * pedacos sem espaco entre eles. E a contagem importa: a linha de preencher a
 * mao, "Nome:        CPF:", e feita de espacos seguidos, e engolir todos menos
 * um fecharia o espaco onde alguem vai escrever.
 */
export type PedacoLido = { texto: string; negrito: boolean; espacos: number };

export type ParagrafoLido = {
  pedacos: PedacoLido[];
  alinhamento: Alinhamento;
  /** Paragrafo sem texto nenhum: vale uma linha em branco, nao se joga fora. */
  vazio: boolean;
};

const ALINHAMENTO_DO_WORD: Record<string, Alinhamento> = {
  left: "ESQUERDA",
  start: "ESQUERDA",
  center: "CENTRO",
  right: "DIREITA",
  end: "DIREITA",
  both: "JUSTIFICADO",
  justify: "JUSTIFICADO",
  distribute: "JUSTIFICADO",
};

/** Os `<w:r>` de um trecho de XML, cada um com o texto e se e negrito. */
function corridasDe(xml: string): Array<{ texto: string; negrito: boolean }> {
  const achadas: Array<{ texto: string; negrito: boolean }> = [];
  const abre = /<w:r(?:\s[^>]*)?>/g;
  let m: RegExpExecArray | null;
  while ((m = abre.exec(xml)) !== null) {
    const fim = xml.indexOf("</w:r>", m.index);
    if (fim === -1) continue;
    const dentro = xml.slice(m.index, fim);
    const propriedades = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(dentro)?.[1] ?? "";
    // `<w:b w:val="0"/>` e negrito DESLIGADO: um estilo do Word pode ligar o
    // negrito no paragrafo e a corrida desligar so nela.
    const negrito =
      /<w:b(?:\s+w:val="(?:1|true|on)")?\s*\/?>/.test(propriedades) &&
      !/<w:b\s+w:val="(?:0|false|off)"/.test(propriedades);
    // Texto, tabulacao e quebra de linha NA ORDEM em que aparecem: a quebra
    // mora fora do <w:t>, e ler so os <w:t> perderia onde a linha termina.
    let texto = "";
    const nos = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\s*\/?>|<w:tab\s*\/?>/g;
    let t: RegExpExecArray | null;
    while ((t = nos.exec(dentro)) !== null) {
      if (t[1] !== undefined) texto += desescaparXml(t[1]);
      else if (t[0].startsWith("<w:br")) texto += "\n";
      else texto += " ";
    }
    if (texto !== "") achadas.push({ texto, negrito });
  }
  return achadas;
}

/**
 * O documento em paragrafos, com alinhamento e negrito.
 *
 * `textoDoDocumento` serve para a previa em tela, onde formatacao nao importa.
 * Aqui importa: quem gera o PDF precisa saber que o titulo e centralizado e
 * que a clausula e justificada, senao a peca sai com a cara errada.
 */
export function estruturaDoDocumento(xml: string): ParagrafoLido[] {
  return paragrafosDe(xml).map((p) => {
    const dentro = xml.slice(p.inicio, p.fim);
    const propriedades = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(dentro)?.[1] ?? "";
    const val = /<w:jc\s+w:val="([a-z]+)"/i.exec(propriedades)?.[1]?.toLowerCase();
    const alinhamento = (val && ALINHAMENTO_DO_WORD[val]) || "ESQUERDA";

    // O paragrafo como uma fita de caracteres, cada um sabendo se e negrito.
    // E preciso juntar antes de separar: o Word parte a palavra no meio de uma
    // corrida, e separar corrida por corrida inventaria espaco onde nao ha.
    const fita: Array<{ c: string; negrito: boolean }> = [];
    for (const corrida of corridasDe(dentro)) {
      for (const c of corrida.texto) fita.push({ c, negrito: corrida.negrito });
    }

    return repartirEmLinhas(fita, alinhamento);
  }).flat();
}

/**
 * A fita de um paragrafo em linhas, quebrando onde o Word quebrou.
 *
 * Uma quebra de linha dentro do paragrafo — `<w:br/>` — vale uma linha nova:
 * e assim que saem as linhas de assinatura, uma embaixo da outra. Sem isso, os
 * tres advogados assinariam na mesma linha.
 */
function repartirEmLinhas(
  fita: Array<{ c: string; negrito: boolean }>,
  alinhamento: Alinhamento,
): ParagrafoLido[] {
  const linhas: ParagrafoLido[] = [];
  let pedacos: PedacoLido[] = [];

  const fechar = () => {
    linhas.push({ pedacos, alinhamento, vazio: pedacos.length === 0 });
    pedacos = [];
  };

  let i = 0;
  let brancos = 0;
  while (i < fita.length) {
    if (fita[i].c === "\n") {
      fechar();
      brancos = 0;
      i++;
      continue;
    }
    if (/\s/.test(fita[i].c)) {
      brancos++;
      i++;
      continue;
    }
    // Uma palavra inteira, repartida so onde o negrito muda.
    let primeiro = true;
    while (i < fita.length && !/\s/.test(fita[i].c)) {
      const negrito = fita[i].negrito;
      let texto = "";
      while (i < fita.length && !/\s/.test(fita[i].c) && fita[i].negrito === negrito) {
        texto += fita[i].c;
        i++;
      }
      // Espaco no comeco da linha nao empurra o texto: e recuo, e recuo e
      // outra coisa, que vem do paragrafo e nao do texto.
      pedacos.push({
        texto,
        negrito,
        espacos: primeiro && pedacos.length > 0 ? Math.max(brancos, 1) : 0,
      });
      primeiro = false;
    }
    brancos = 0;
  }
  fechar();
  return linhas;
}
