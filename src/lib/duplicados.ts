// Cadastro repetido e publicacao repetida.
//
// A REGRA QUE MANDA EM TODO ESTE ARQUIVO: na duvida, NAO e duplicata. Juntar
// dois atos diferentes pode custar um prazo; deixar uma repeticao na tela
// custa um cartao a mais. Os dois erros nao tem o mesmo tamanho, e o codigo
// trata disso de proposito.
//
// Nada aqui toca banco.

/** Sem acento, maiusculo, espacos colapsados. */
export function normalizarNome(nome: string): string {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function digitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

export type Existente = { id: string; nome: string; documento: string | null };

export type Conflito =
  | { motivo: "DOCUMENTO"; existente: Existente }
  | { motivo: "NOME"; existente: Existente };

/**
 * Ja existe este cliente?
 *
 * DOCUMENTO IGUAL E A MESMA PESSOA, sem duvida — e isso o sistema barra.
 *
 * NOME IGUAL NAO E A MESMA PESSOA NECESSARIAMENTE, e aqui o BirdJud se
 * afasta de propósito do sistema de onde veio esta ideia. La, nome repetido
 * tambem barrava: era um escritorio so, com uma carteira que cabia na cabeca
 * de quem cadastrava. Num sistema de muitos escritorios ha bancas com milhares
 * de clientes, e dois "Jose Silva" diferentes sao questao de tempo. Barrar
 * deixaria o escritorio sem saida: nao da para cadastrar o segundo, e nao ha a
 * quem recorrer.
 *
 * Entao nome repetido AVISA, mostrando quem ja existe e o documento dele, e
 * quem cadastra confirma que e outra pessoa. O duplo cadastro por descuido
 * continua barrado — ninguem confirma sem ler —, e o homonimo real entra.
 */
export function conflitoDeCliente(
  novo: { nome: string; documento?: string | null },
  existentes: Existente[],
): Conflito | null {
  const doc = digitos(novo.documento);
  if (doc) {
    const porDocumento = existentes.find((c) => digitos(c.documento) === doc);
    if (porDocumento) return { motivo: "DOCUMENTO", existente: porDocumento };
  }

  const nome = normalizarNome(novo.nome);
  if (!nome) return null;
  const porNome = existentes.find((c) => normalizarNome(c.nome) === nome);
  return porNome ? { motivo: "NOME", existente: porNome } : null;
}

export function mensagemDoConflito(c: Conflito): string {
  if (c.motivo === "DOCUMENTO") {
    return (
      `Ja existe um cliente com este CPF/CNPJ: "${c.existente.nome}". ` +
      "Documento igual e a mesma pessoa — edite o cadastro que ja existe em vez de criar outro."
    );
  }
  return (
    `Ja existe um cliente com este nome: "${c.existente.nome}"` +
    (c.existente.documento ? ` (${c.existente.documento})` : " (sem CPF/CNPJ no cadastro)") +
    ". Se for a mesma pessoa, edite o cadastro que ja existe. Se for outra pessoa com o " +
    "mesmo nome, confirme para cadastrar assim mesmo."
  );
}

// ---------------------------------------------------------------------------
// Publicacoes
// ---------------------------------------------------------------------------

/**
 * A mesma publicacao chega repetida de tres jeitos:
 *
 * 1. o mesmo despacho publicado UMA VEZ POR PARTE intimada — texto igual, so
 *    muda o "Intimado(s)" do fim. Cada uma vem com id proprio do diario, entao
 *    o indice unico por id nao pega;
 * 2. o mesmo ato em dois cadernos, com cabecalho e formatacao diferentes;
 * 3. a mesma comunicacao baixada duas vezes — essa o indice unico ja pega.
 *
 * Comparar so texto identico pegaria apenas a terceira.
 */
export const JANELA_EM_DIAS = 3;

/** Acima disto e a mesma coisa com cabecalho a mais: marca sozinho. */
export const CERTEZA = 0.9;

/** Abaixo disto as palavras em comum sao poucas demais para ser o mesmo ato. */
export const PARECIDO = 0.6;

export function normalizarTexto(texto: string): string {
  return (texto ?? "")
    .replace(/<[^>]*>/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Quanto do texto MENOR aparece no maior, de 0 a 1.
 *
 * Contencao, e nao semelhanca: o mesmo ato publicado com um cabecalho a mais
 * tem textos de tamanhos bem diferentes, e qualquer medida simetrica diria que
 * sao pouco parecidos — justamente no caso que mais importa pegar.
 */
export function contencao(a: string, b: string): number {
  const pa = new Set(a.split(" ").filter(Boolean));
  const pb = new Set(b.split(" ").filter(Boolean));
  const [menor, maior] = pa.size <= pb.size ? [pa, pb] : [pb, pa];
  if (menor.size === 0) return 0;
  let comum = 0;
  for (const p of menor) if (maior.has(p)) comum += 1;
  return comum / menor.size;
}

export type Veredito = "REPETIDA" | "PARECE_REPETIDA" | "DIFERENTE";

export type PublicacaoParaComparar = {
  id: string;
  numeroProcesso: string | null;
  /** "AAAA-MM-DD". */
  dia: string;
  texto: string;
};

function diasEntre(a: string, b: string): number {
  return Math.abs(
    (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000,
  );
}

/**
 * Duas publicacoes sao o mesmo ato?
 *
 * So se compara o que PODE ser o mesmo ato: mesmo processo, poucos dias de
 * diferenca. Publicacao sem numero de processo nao se compara com nada — sem
 * o processo, dois textos parecidos podem ser dois despachos padrao de
 * processos que nada tem a ver.
 *
 * E a faixa do meio NAO decide sozinha: fica "parece repetida", visivel, para
 * uma pessoa dizer. Na duvida, nao e duplicata.
 */
export function compararPublicacoes(
  a: PublicacaoParaComparar,
  b: PublicacaoParaComparar,
): { veredito: Veredito; contencao: number } {
  if (!a.numeroProcesso || !b.numeroProcesso) return { veredito: "DIFERENTE", contencao: 0 };
  if (digitos(a.numeroProcesso) !== digitos(b.numeroProcesso)) {
    return { veredito: "DIFERENTE", contencao: 0 };
  }
  if (diasEntre(a.dia, b.dia) > JANELA_EM_DIAS) {
    return { veredito: "DIFERENTE", contencao: 0 };
  }

  const valor = contencao(normalizarTexto(a.texto), normalizarTexto(b.texto));
  if (valor >= CERTEZA) return { veredito: "REPETIDA", contencao: valor };
  if (valor >= PARECIDO) return { veredito: "PARECE_REPETIDA", contencao: valor };
  return { veredito: "DIFERENTE", contencao: valor };
}

export type Marcacao = {
  id: string;
  /** A publicacao de que esta e repeticao. */
  duplicataDe: string;
  veredito: Exclude<Veredito, "DIFERENTE">;
  contencao: number;
};

/**
 * Acha as repeticoes em um lote, apontando sempre para a PRIMEIRA.
 *
 * A primeira e a que fica: e a que ja pode ter sido lida, vinculada a um
 * processo ou virado prazo. Apontar para a mais nova faria o trabalho ja feito
 * sumir da tela.
 *
 * Nada e apagado. Repeticao e MARCADA, e marcacao se desfaz; exclusao, nao.
 */
export function acharRepeticoes(
  publicacoes: PublicacaoParaComparar[],
): Marcacao[] {
  // Da mais antiga para a mais nova: a primeira de cada grupo e a original.
  const ordenadas = [...publicacoes].sort((x, y) => x.dia.localeCompare(y.dia));
  const marcadas: Marcacao[] = [];
  const jaMarcadas = new Set<string>();

  for (let i = 0; i < ordenadas.length; i++) {
    const original = ordenadas[i];
    if (jaMarcadas.has(original.id)) continue;

    for (let j = i + 1; j < ordenadas.length; j++) {
      const candidata = ordenadas[j];
      if (jaMarcadas.has(candidata.id)) continue;

      const r = compararPublicacoes(original, candidata);
      if (r.veredito === "DIFERENTE") continue;

      marcadas.push({
        id: candidata.id,
        duplicataDe: original.id,
        veredito: r.veredito,
        contencao: r.contencao,
      });
      // So sai de cena o que foi marcado com certeza. O "parece" continua
      // podendo ser comparado com os outros: e justamente o caso em que
      // ninguem decidiu nada ainda.
      if (r.veredito === "REPETIDA") jaMarcadas.add(candidata.id);
    }
  }

  return marcadas;
}
