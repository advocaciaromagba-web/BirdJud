// O extrato da InfinitePay vem por CSV, nao por API.
//
// Diferente do Asaas, nao existe endpoint para listar o que passou na conta:
// o app exporta CSV, XLS, OFX ou PDF, e so. Entao o escritorio baixa o CSV e
// manda aqui — e as linhas caem na MESMA fila de conferencia do Asaas, com as
// mesmas regras (ver conciliacao.ts). Dois extratos, uma tela.
//
// Nada aqui toca banco: so se le o texto e se devolve linhas.
import { createHash } from "node:crypto";

/** As colunas que o arquivo precisa ter para ser o extrato deles. */
export const COLUNAS = ["Data", "Hora", "Tipo de transação", "Nome", "Detalhe", "Valor"] as const;

export type LinhaDoExtrato = {
  /** Hash da linha: a InfinitePay nao manda id de transacao no CSV. */
  idNoProvedor: string;
  tipo: string;
  valorCentavos: number;
  /** "AAAA-MM-DD". */
  data: string;
  descricao: string;
};

export type LeituraDoCsv = {
  linhas: LinhaDoExtrato[];
  lidas: number;
  /** Linhas que nao deu para entender, com o motivo. */
  recusadas: Array<{ linha: number; motivo: string }>;
  /** Quando o arquivo inteiro nao serve. */
  erro: string | null;
};

/**
 * Separa um campo por vez, respeitando aspas.
 *
 * Nome de cliente com virgula dentro ("SILVA, JOAO") e comum, e um split
 * ingenuo partiria a linha no meio e jogaria o valor para a coluna errada.
 */
export function separarCampos(linha: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      // Aspas dobradas dentro do campo sao uma aspa literal.
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
    } else if ((c === "," || c === ";") && !dentroDeAspas) {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

/** "+R$ 1.234,56" -> 123456 | "-R$ 500,00" -> -50000. */
export function valorEmCentavos(texto: string): number | null {
  const limpo = (texto ?? "").replace(/R\$/gi, "").replace(/\s| /g, "");
  if (!limpo) return null;
  const negativo = limpo.startsWith("-") || limpo.startsWith("(");
  const numerico = limpo.replace(/[+\-()]/g, "").replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(numerico)) return null;
  // Em centavos pelo texto, nunca por multiplicacao: 1.1 * 100 da
  // 110.00000000000001 em ponto flutuante.
  const [inteiros, decimais = ""] = numerico.split(".");
  const centavos = Number(inteiros) * 100 + Number(decimais.padEnd(2, "0"));
  return negativo ? -centavos : centavos;
}

/** Como o tipo deles vira o nosso, que conciliacao.ts sabe classificar. */
export function tipoDaLinha(tipoDeTransacao: string, detalhe: string): string {
  const t = (tipoDeTransacao ?? "").toLowerCase();
  const d = (detalhe ?? "").toLowerCase();
  const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

  if (t === "pix" && semAcento(d).includes("recebid")) return "PIX_RECEBIDO";
  if (t === "pix" && semAcento(d).includes("enviad")) return "PIX_ENVIADO";
  if (t.includes("boleto")) return "BOLETO_PAGO";
  if (semAcento(t).includes("deposito") || semAcento(d).includes("deposito")) {
    return "DEPOSITO_VENDAS";
  }
  // Tipo que nao se conhece sobe com o nome que veio: conciliacao.ts trata
  // desconhecido como "nunca automatico", que e o que se quer.
  return `${tipoDeTransacao}_${detalhe}`
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "")
    .slice(0, 60);
}

/**
 * A chave que impede reimportar o mesmo periodo e duplicar tudo.
 *
 * O CSV nao traz id de transacao, entao a chave e um hash do que identifica a
 * linha. Duas linhas REALMENTE iguais — mesmo dia, mesma hora, mesmo nome,
 * mesmo valor — dao o mesmo hash e contam como uma so. E uma escolha: e mais
 * provavel ser a mesma linha reimportada do que dois Pix identicos no mesmo
 * segundo, e contar a mais seria pior do que contar a menos.
 */
export function chaveDaLinha(
  data: string,
  hora: string,
  nome: string,
  detalhe: string,
  centavos: number,
): string {
  return createHash("sha256")
    .update(`${data}|${hora}|${nome}|${detalhe}|${centavos}`)
    .digest("hex")
    .slice(0, 40);
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const DIA_BR = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function comoDia(texto: string): string | null {
  const t = (texto ?? "").trim();
  if (DIA.test(t)) return t;
  const br = DIA_BR.exec(t);
  // O app exporta em pt-BR dependendo do aparelho: aceitar os dois e aceitar
  // o arquivo que a pessoa realmente tem.
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null;
}

export function lerCsvDaInfinitePay(conteudo: string): LeituraDoCsv {
  const vazio: LeituraDoCsv = { linhas: [], lidas: 0, recusadas: [], erro: null };

  // BOM no comeco faz a primeira coluna virar "﻿Data" e nenhuma coluna
  // casar — e o arquivo pareceria "de outro sistema" sem ser.
  const texto = conteudo.replace(/^﻿/, "");
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (linhas.length === 0) return { ...vazio, erro: "O arquivo esta vazio." };

  const cabecalho = separarCampos(linhas[0]);
  const faltando = COLUNAS.filter((c) => !cabecalho.includes(c));
  if (faltando.length > 0) {
    return {
      ...vazio,
      erro:
        "Este arquivo nao parece o extrato da InfinitePay — faltam as colunas: " +
        `${faltando.join(", ")}.`,
    };
  }

  const onde = {
    data: cabecalho.indexOf("Data"),
    hora: cabecalho.indexOf("Hora"),
    tipo: cabecalho.indexOf("Tipo de transação"),
    nome: cabecalho.indexOf("Nome"),
    detalhe: cabecalho.indexOf("Detalhe"),
    valor: cabecalho.indexOf("Valor"),
  };

  const resultado: LeituraDoCsv = { ...vazio, lidas: linhas.length - 1, linhas: [], recusadas: [] };

  for (let i = 1; i < linhas.length; i++) {
    const campos = separarCampos(linhas[i]);

    // A LINHA TEM DE BATER COM O CABECALHO, campo a campo.
    //
    // Sem esta conferencia, um valor sem aspas com virgula decimal
    // ("+R$ 980,45") vira dois campos, todas as colunas seguintes andam uma
    // casa, e o que entra no financeiro e "+R$ 980" — quarenta e cinco
    // centavos somem em silencio, linha por linha. Pior: em "+R$ 1.500,00" o
    // truncamento da no mesmo numero, entao o erro se esconde justamente nas
    // linhas que alguem conferiria primeiro.
    if (campos.length !== cabecalho.length) {
      resultado.recusadas.push({
        linha: i + 1,
        motivo: `a linha tem ${campos.length} campos e o cabecalho tem ${cabecalho.length}`,
      });
      continue;
    }

    const data = comoDia(campos[onde.data] ?? "");
    const centavos = valorEmCentavos(campos[onde.valor] ?? "");

    if (!data || centavos === null) {
      // Linha pela metade NAO vira lancamento: metade de um lancamento no
      // financeiro e pior que lancamento nenhum.
      resultado.recusadas.push({
        linha: i + 1,
        motivo: !data ? "nao entendi a data" : "nao entendi o valor",
      });
      continue;
    }

    const hora = (campos[onde.hora] ?? "").trim();
    const nome = (campos[onde.nome] ?? "").trim();
    const detalhe = (campos[onde.detalhe] ?? "").trim();
    const tipo = tipoDaLinha(campos[onde.tipo] ?? "", detalhe);

    resultado.linhas.push({
      idNoProvedor: chaveDaLinha(data, hora, nome, detalhe, centavos),
      tipo,
      valorCentavos: centavos,
      data,
      descricao: nome || detalhe || tipo,
    });
  }

  return resultado;
}
