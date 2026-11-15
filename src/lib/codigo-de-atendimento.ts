// Codigo de atendimento do cliente: a barreira contra o golpe do falso
// advogado (15/11/2026, vindo do sistema da Advocacia Roma, reescrito aqui).
//
// COMO FUNCIONA, E POR QUE NESSA DIRECAO: quem DIZ o codigo e o ESCRITORIO, no
// comeco de todo atendimento. O codigo prova ao cliente que quem fala e o
// escritorio. O cliente e orientado a NUNCA informar o codigo a quem pedir: se
// ele fosse treinado a recitar o codigo quando perguntado, o golpista so
// precisaria perguntar — e pedir e exatamente o que o golpista faz. Quem e do
// escritorio ja sabe o codigo; quem pede, nao e do escritorio.
//
// Por isso NAO EXISTE aqui funcao que receba um codigo digitado pelo cliente e
// responda "confere". A unica leitura e: dado o cliente, qual codigo o
// atendente deve dizer.
//
// Este arquivo e puro (sem banco nem rede): a tela e os testes usam o mesmo.
import { randomInt } from "node:crypto";

/**
 * Palavras do codigo. Coisa concreta que se ve e se pega (fruta, bicho,
 * planta, objeto de casa e de roca), sem acento, cedilha nem hifen: o cliente
 * fala o codigo ao telefone e as vezes anota a mao, e duas grafias do mesmo
 * codigo e o mesmo que codigo nenhum. Nada que soe como outra palavra ao
 * telefone, nada que constranja quem repete em voz alta.
 */
export const PALAVRAS = [
  // frutas
  "ABACATE", "ACEROLA", "AMORA", "BANANA", "CAJU", "COCO", "FIGO", "GOIABA", "GRAVIOLA", "JENIPAPO",
  "LARANJA", "MANGA", "MELANCIA", "MORANGO", "PEQUI", "PERA", "PITANGA", "SAPOTI", "UMBU", "UVA",
  // bichos
  "ABELHA", "ANDORINHA", "ARARA", "BEZERRO", "BOI", "BORBOLETA", "CABRA", "CANARIO", "CAPIVARA", "CARNEIRO",
  "CAVALO", "CORUJA", "FORMIGA", "GALO", "GATO", "LOBO", "MARRECO", "OVELHA", "PARDAL", "PATO",
  "PERIQUITO", "PERU", "PEIXE", "RAPOSA", "SAPO", "TATU", "TUCANO",
  // plantas e roca
  "ALGODAO", "ARROZ", "BAMBU", "CACTO", "CAFEZAL", "CANAVIAL", "CEDRO", "EUCALIPTO", "GIRASSOL", "MARGARIDA",
  "MILHARAL", "MILHO", "PALMEIRA", "PINHEIRO", "ROSA", "SAMAMBAIA", "SOJA", "TRIGO", "VIOLETA",
  // casa e trabalho
  "BALDE", "BICICLETA", "CANOA", "CARRINHO", "CELEIRO", "CERCA", "CHAVE", "CHINELO", "COLHER", "CURRAL",
  "ENXADA", "ESCADA", "FOICE", "GARRAFA", "JANELA", "JANGADA", "LANTERNA", "MARTELO", "MOINHO", "PANELA",
  "PENEIRA", "PORTEIRA", "SERROTE", "TELHADO", "TRATOR", "VARANDA", "VASSOURA",
  // natureza
  "ALVORADA", "AREIA", "BARRO", "CACHOEIRA", "CAMPO", "CHUVA", "DUNA", "ESTRELA", "GEADA", "LAGOA",
  "MADRUGADA", "MORRO", "NEBLINA", "NUVEM", "ORVALHO", "PEDRA", "PLANETA", "POENTE", "PRAIA", "RIACHO",
  "SERRA", "TROVOADA", "VENTO",
  // comida de casa
  "BEIJU", "BOLACHA", "BROA", "CANJICA", "CUSCUZ", "FARINHA", "MANTEIGA", "MELADO", "PAMONHA", "PIPOCA",
  "QUEIJO", "RAPADURA", "ROSQUINHA", "TAPIOCA",
] as const;

/** 10 a 99: zero na frente ("PENEIRA 05") se perde ao falar e ao anotar. */
const MENOR = 10;
const MAIOR = 99;

/** Quantos codigos diferentes cabem num escritorio. */
export const TOTAL_POSSIVEL = PALAVRAS.length * (MAIOR - MENOR + 1);

/**
 * Sorteia um codigo. randomInt (do sistema operacional), e nao Math.random:
 * o codigo e uma chave, e chave nao sai de gerador previsivel.
 */
export function sortearCodigo(): string {
  return `${PALAVRAS[randomInt(PALAVRAS.length)]} ${randomInt(MENOR, MAIOR + 1)}`;
}

/** "girassol 27", "Girassol-27" e "GIRASSOL27" sao o mesmo codigo. */
export function normalizarCodigo(bruto: unknown): string {
  return String(bruto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

// ---------------------------------------------------------------------------
// Por onde o codigo chega ao cliente
// ---------------------------------------------------------------------------

/**
 * REFORCO e o aviso semanal 2 a 5, que NAO leva o codigo: fica no historico
 * para se saber que o cliente foi lembrado. TROCA registra que o codigo antigo
 * deixou de valer.
 */
export const CANAIS = ["CONTRATO", "PESSOALMENTE", "EMAIL", "WHATSAPP", "REFORCO", "TROCA"] as const;
export type Canal = (typeof CANAIS)[number];

export const ROTULO_DO_CANAL: Record<Canal, string> = {
  CONTRATO: "no contrato",
  PESSOALMENTE: "pessoalmente, no escritório",
  EMAIL: "no e-mail do cadastro",
  WHATSAPP: "no WhatsApp do cadastro",
  REFORCO: "lembrete das regras (sem o código)",
  TROCA: "código trocado",
};

/**
 * Codigo esquecido volta SO pessoalmente ou no e-mail que JA estava no
 * cadastro. A guarda e estrutural: nenhuma rota aceita endereco de destino.
 * Esta funcao so diz se o cadastro tem um e-mail que sirva.
 */
export function emailServe(email: string | null | undefined): boolean {
  return !!email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
}

// ---------------------------------------------------------------------------
// O que o cliente le
// ---------------------------------------------------------------------------

export type Banca = {
  /** Nome do escritorio, como o cliente o conhece. */
  nome: string;
  /** Telefone de atendimento do escritorio: e para onde o cliente liga na duvida. */
  telefone: string;
};

/**
 * As cinco regras. Frases curtas, uma ordem por linha, sem palavra de jurista.
 *
 * A regra 4 fala do golpe como ele e (taxa "para liberar o dinheiro do
 * processo") e NAO diz que o escritorio "nunca pede pagamento por mensagem":
 * o proprio sistema manda link de boleto e Pix do escritorio, e promessa falsa
 * em aviso de seguranca e pior que promessa nenhuma.
 */
export function regras(b: Banca): string[] {
  return [
    "1) Sempre que o escritório falar com você, nós dizemos o seu código no começo da conversa.",
    `2) Se alguém disser que é do escritório e não souber o seu código, NÃO É O ESCRITÓRIO. Desligue e ligue para ${b.telefone}.`,
    "3) NUNCA diga o seu código a quem pedir. Quem é do escritório já sabe o seu código.",
    `4) O escritório nunca pede Pix, depósito ou taxa para liberar dinheiro de processo. Antes de pagar qualquer coisa, ligue para ${b.telefone}.`,
    "5) Guarde o seu código. Se esquecer, procure o escritório: não mandamos o código a quem pede por mensagem.",
  ];
}

/** O texto que vai no contrato e na folha do codigo. */
export function orientacaoAoCliente(codigo: string, b: Banca): string[] {
  return [
    `Seu código de atendimento é: ${codigo}`,
    `Guarde este código. Ele serve para você saber que quem está falando com você é mesmo ${doEscritorio(b.nome).replace(/^do /, "o ")}.`,
    ...regras(b),
  ];
}

/** O anuncio do primeiro aviso — a unica frase da campanha que leva o codigo. */
export function anuncio(codigo: string): string {
  return `Passamos a usar um código de atendimento para cada cliente, para impedir o golpe do falso advogado. O seu código é ${codigo}.`;
}

/** O primeiro aviso, para o e-mail. */
export function primeiroAviso(codigo: string, nomeDoCliente: string, b: Banca, empresa = false): { assunto: string; texto: string } {
  return {
    assunto: `Seu código de atendimento — ${b.nome}`,
    texto: [
      saudacao(nomeDoCliente, empresa),
      "",
      `Aviso de segurança ${doEscritorio(b.nome)}.`,
      "",
      anuncio(codigo),
      "",
      "Como funciona:",
      ...regras(b),
      "",
      `${b.nome} · ${b.telefone}`,
    ].join("\n"),
  };
}

/** Quantos avisos a campanha manda, contando o primeiro. */
export const TOTAL_DE_AVISOS = 5;
/** Uma semana entre um aviso e o seguinte. */
export const DIAS_ENTRE_AVISOS = 7;

/**
 * Os avisos 2 a 5: reforco semanal, SEM o codigo.
 *
 * Um aviso so nao fixa, e a barreira vale pelo que o cliente lembra na hora em
 * que o telefone toca. Mas o codigo nao volta em mensagem de mutirao: mandar
 * em massa cinco vezes multiplicaria as copias dele por ai sem proteger nada a
 * mais. Cada semana puxa um lado, para nao virar mensagem que a pessoa para de
 * ler. Ha teste que falha se algum reforco levar codigo.
 */
export function reforco(etapa: number, b: Banca): string[] {
  const porEtapa: Record<number, string[]> = {
    2: [
      "Você tem um código de atendimento. Sempre que o escritório falar com você, nós dizemos o seu código no começo da conversa.",
      `Se alguém disser que é do escritório e não souber o seu código, NÃO É O ESCRITÓRIO. Desligue e ligue para ${b.telefone}.`,
    ],
    3: [
      "NUNCA diga o seu código a quem pedir. Quem é do escritório já sabe o seu código.",
      "Pedir o seu código é o que o golpista faz. Nós nunca pedimos. Se alguém pediu, avise o escritório.",
    ],
    4: [
      "O escritório nunca pede Pix, depósito ou taxa para liberar dinheiro de processo.",
      `Se pediram dinheiro em nome do escritório, não pague: ligue antes para ${b.telefone}.`,
    ],
    5: [
      "Último lembrete: guarde o seu código de atendimento. Quem fala com você pelo escritório diz o seu código; quem não sabe, não é do escritório.",
      "Se esqueceu o seu código, procure o escritório: não mandamos o código a quem pede por mensagem.",
    ],
  };
  return porEtapa[etapa] ?? porEtapa[5];
}

export function emailDeReforco(etapa: number, nomeDoCliente: string, b: Banca, empresa = false): { assunto: string; texto: string } {
  return {
    assunto: `Lembrete de segurança — ${b.nome}`,
    texto: [saudacao(nomeDoCliente, empresa), "", `Lembrete de segurança ${doEscritorio(b.nome)}.`, "", ...reforco(etapa, b), "", `${b.nome} · ${b.telefone}`].join("\n"),
  };
}

/** "do escritório Prado & Moura"; mas "do Escritório Modelo", sem repetir a palavra. */
export function doEscritorio(nome: string): string {
  return /^escrit[oó]rio\b/i.test(nome.trim()) ? `do ${nome.trim()}` : `do escritório ${nome.trim()}`;
}

/** CNPJ no cadastro: e empresa, e empresa nao tem primeiro nome. */
export function ehEmpresa(documento: string | null | undefined): boolean {
  return String(documento ?? "").replace(/\D/g, "").length === 14;
}

/** "Olá, Maria." para pessoa; "Olá." para empresa ("Olá, Construtora." nao e saudacao). */
export function saudacao(nome: string, empresa = false): string {
  return empresa ? "Olá." : `Olá, ${primeiroNome(nome)}.`;
}

export function primeiroNome(nome: string): string {
  const p = nome.trim().split(/\s+/)[0] ?? "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "cliente";
}

// ---------------------------------------------------------------------------
// O botao de WhatsApp: a conversa ja comeca com o codigo
// ---------------------------------------------------------------------------

/** So digitos, com o 55 na frente. Nulo se nao parece telefone brasileiro. */
export function telefoneParaWaMe(bruto: string | null | undefined): string | null {
  const d = String(bruto ?? "").replace(/\D/g, "");
  const semPais = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
  if (semPais.length !== 10 && semPais.length !== 11) return null;
  return `55${semPais}`;
}

/**
 * Link wa.me com a saudacao e o codigo ja escritos. Quem aperta enviar e a
 * pessoa, pelo WhatsApp do escritorio: nao gasta modelo da Meta. O numero vem
 * SEMPRE do cadastro: nao ha parametro para outro, porque o golpe comeca com
 * alguem pedindo que se mande algo para um numero novo.
 */
export function linkDoWhatsapp(
  cliente: { nome: string; telefone: string | null; documento?: string | null },
  codigo: string,
  nomeDoEscritorio: string,
): string | null {
  const numero = telefoneParaWaMe(cliente.telefone);
  if (!numero) return null;
  const empresa = ehEmpresa(cliente.documento);
  const texto = `${saudacao(cliente.nome, empresa)} Aqui é ${doEscritorio(nomeDoEscritorio)}. ${
    empresa ? `O código de atendimento de ${cliente.nome.trim()} é` : "O seu código de atendimento é"
  } ${codigo}.`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

// ---------------------------------------------------------------------------
// Arquivo de contatos: o codigo no nome, a vista dentro do WhatsApp
// ---------------------------------------------------------------------------

/** vCard: virgula, ponto-e-virgula e barra sao separadores e precisam de escape. */
function escaparVcard(t: string): string {
  return t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, " ");
}

/** "MARIA DA SILVA SANTOS" -> "MARIA SANTOS": o WhatsApp corta o FIM do nome, onde esta o codigo. */
export function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return partes.length <= 2 ? partes.join(" ") : `${partes[0]} ${partes[partes.length - 1]}`;
}

/** CR + LF, montado por codigo de caractere para nenhum compilador "simplificar". */
const FIM_DE_LINHA = String.fromCharCode(13) + String.fromCharCode(10);

export type ContatoComCodigo = { nome: string; telefone: string | null; codigo: string };

/**
 * O .vcf com "NOME — CODIGO" em cada contato. Importado no celular de quem
 * atende, a conversa aparece com o codigo no topo. Linhas terminam em CRLF:
 * ha importador que recusa o arquivo inteiro sem isso. Quem nao tem telefone
 * valido fica de fora.
 */
export function montarVcard(contatos: ContatoComCodigo[], curto: boolean): { arquivo: string; quantos: number } {
  const cartoes: string[] = [];
  for (const c of contatos) {
    const numero = telefoneParaWaMe(c.telefone);
    if (!numero) continue;
    const nome = escaparVcard(`${curto ? nomeCurto(c.nome) : c.nome.trim()} — ${c.codigo}`);
    cartoes.push(["BEGIN:VCARD", "VERSION:3.0", `FN:${nome}`, `N:${nome};;;;`, `TEL;TYPE=CELL:+${numero}`, "END:VCARD"].join("\n"));
  }
  // O CRLF entra AQUI, numa troca feita em tempo de execucao, e nao nos join
  // acima. Motivo medido em 15/11/2026: o compilador de producao funde o join
  // de constantes num texto so (template literal) com o CRLF cru dentro, e a
  // linguagem transforma CRLF cru de template em LF. O arquivo saia com LF
  // dentro de cada cartao, so em producao, e o teste unitario nao via.
  const arquivo = cartoes.length ? `${cartoes.join("\n")}\n`.replace(/\r?\n/g, FIM_DE_LINHA) : "";
  return { arquivo, quantos: cartoes.length };
}

// ---------------------------------------------------------------------------
// No contrato
// ---------------------------------------------------------------------------

/**
 * A folha do codigo: pagina propria no fim do contrato, com o codigo em letra
 * grande. No dia da ligacao estranha, a pessoa precisa achar o codigo em
 * segundos — nao no meio de uma clausula.
 */
export function folhaDoCodigo(codigo: string, nomeDoCliente: string, b: Banca): FolhaLinha[] {
  const [, guarde, ...lista] = orientacaoAoCliente(codigo, b);
  return [
    { texto: "CÓDIGO DE ATENDIMENTO", negrito: true, centro: true, novaPagina: true, espacoDepois: true },
    { texto: `Cliente: ${nomeDoCliente}`, centro: true, espacoDepois: true },
    { texto: codigo, negrito: true, centro: true, corpo: 28, espacoDepois: true },
    { texto: guarde, espacoDepois: true },
    ...lista.map((texto) => ({ texto, espacoDepois: true })),
    { texto: "Guarde esta folha em lugar seguro, junto dos seus documentos.", negrito: true, centro: true },
  ];
}

/** O mesmo formato de linha de docx.ts, repetido aqui para este arquivo seguir sem dependencia. */
export type FolhaLinha = { texto: string; negrito?: boolean; centro?: boolean; espacoDepois?: boolean; novaPagina?: boolean; corpo?: number };
