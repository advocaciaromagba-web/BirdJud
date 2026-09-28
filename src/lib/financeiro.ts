// O financeiro do escritorio: categorias, despesas fixas e o resumo do mes.
//
// Duas decisoes que valem para o arquivo inteiro:
//
// 1. dinheiro e sempre centavos inteiros. Ponto flutuante nao entra em valor —
//    0.1 + 0.2 nao da 0.3, e num sistema que fecha caixa isso vira diferenca
//    que ninguem acha;
// 2. a categoria e fechada. Campo livre de categoria vira "agua", "Agua",
//    "conta de agua" e "AGUA" na mesma base, e nenhum grafico fecha depois.

export const CATEGORIAS_DE_DESPESA = [
  "ALUGUEL",
  "CONDOMINIO",
  "AGUA",
  "ENERGIA",
  "INTERNET",
  "TELEFONE",
  "SOFTWARE",
  "CONTABILIDADE",
  "IMPOSTOS",
  "SALARIOS",
  "PRO_LABORE",
  "CUSTAS",
  "MARKETING",
  "MATERIAL",
  "VIAGENS",
  "OUTRAS_DESPESAS",
] as const;

export const CATEGORIAS_DE_RECEITA = [
  "HONORARIOS",
  "HONORARIOS_DE_EXITO",
  "CONSULTORIA",
  "REEMBOLSO",
  "OUTRAS_RECEITAS",
] as const;

export type CategoriaDeDespesa = (typeof CATEGORIAS_DE_DESPESA)[number];
export type CategoriaDeReceita = (typeof CATEGORIAS_DE_RECEITA)[number];
export type Categoria = CategoriaDeDespesa | CategoriaDeReceita;

export const CATEGORIAS: readonly Categoria[] = [
  ...CATEGORIAS_DE_DESPESA,
  ...CATEGORIAS_DE_RECEITA,
];

const ROTULOS: Record<Categoria, string> = {
  ALUGUEL: "Aluguel",
  CONDOMINIO: "Condominio",
  AGUA: "Agua e esgoto",
  ENERGIA: "Energia eletrica",
  INTERNET: "Internet",
  TELEFONE: "Telefone",
  SOFTWARE: "Software e assinaturas",
  CONTABILIDADE: "Contabilidade",
  IMPOSTOS: "Impostos e taxas",
  SALARIOS: "Salarios e encargos",
  PRO_LABORE: "Pro-labore e retiradas",
  CUSTAS: "Custas e despesas processuais",
  MARKETING: "Marketing",
  MATERIAL: "Material de escritorio",
  VIAGENS: "Viagens e deslocamento",
  OUTRAS_DESPESAS: "Outras despesas",
  HONORARIOS: "Honorarios",
  HONORARIOS_DE_EXITO: "Honorarios de exito",
  CONSULTORIA: "Consultoria",
  REEMBOLSO: "Reembolso de despesas",
  OUTRAS_RECEITAS: "Outras receitas",
};

export function rotuloDaCategoria(categoria: string): string {
  return ROTULOS[categoria as Categoria] ?? categoria;
}

export function ehCategoria(valor: string): valor is Categoria {
  return (CATEGORIAS as readonly string[]).includes(valor);
}

export function categoriasDoTipo(tipo: string): readonly Categoria[] {
  return tipo === "RECEITA" ? CATEGORIAS_DE_RECEITA : CATEGORIAS_DE_DESPESA;
}

/**
 * A categoria combina com o tipo?
 *
 * Aluguel lancado como receita e erro de digitacao, e passa despercebido no
 * total — mas destroi o grafico e o comparativo com o mes anterior.
 */
export function categoriaCombina(tipo: string, categoria: string): boolean {
  return (categoriasDoTipo(tipo) as readonly string[]).includes(categoria);
}

/**
 * Categoria provavel a partir do nome do fornecedor.
 *
 * Isto NAO substitui a leitura por IA: serve para o palpite barato, quando a
 * pessoa digita "Embasa" ou "Coelba" a mao. Palpite errado e so um campo para
 * corrigir, e por isso a lista e curta e obvia — nao vale arriscar
 * classificacao criativa em dado contabil.
 */
const PISTAS: [RegExp, CategoriaDeDespesa][] = [
  [/\b(embasa|sabesp|cedae|caern|casan|corsan|cagece|saneamento|agua)\b/i, "AGUA"],
  [/\b(coelba|neoenergia|cemig|copel|cpfl|enel|light|celpe|energisa|eletrop|energia|luz)\b/i, "ENERGIA"],
  [/\b(vivo|claro|tim|oi|net|algar|sercomtel|internet|banda larga|fibra)\b/i, "INTERNET"],
  [/\b(telefon|celular|movel)\b/i, "TELEFONE"],
  [/\b(condominio|condomin)\b/i, "CONDOMINIO"],
  [/\b(aluguel|locacao|imobiliaria)\b/i, "ALUGUEL"],
  [/\b(contabil|contador|escritorio contabil)\b/i, "CONTABILIDADE"],
  [/\b(darf|das|iss|inss|fgts|simples nacional|imposto|tributo)\b/i, "IMPOSTOS"],
  [/\b(custas|guia judicial|darj|fundesp|oab)\b/i, "CUSTAS"],
];

export function categoriaProvavel(texto: string): CategoriaDeDespesa | null {
  for (const [pista, categoria] of PISTAS) {
    if (pista.test(texto)) return categoria;
  }
  return null;
}

/** Competencia "aaaa-mm" de uma data, no fuso de Brasilia. */
export function competenciaDaData(data: Date): string {
  const emBrasilia = new Date(
    data.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
  );
  const mes = String(emBrasilia.getMonth() + 1).padStart(2, "0");
  return `${emBrasilia.getFullYear()}-${mes}`;
}

export type Lancamento = {
  tipo: string;
  categoria: string | null;
  valorCentavos: number;
  competencia: string;
  pagoEm: Date | null;
};

export type Resumo = {
  receitas: number;
  despesas: number;
  saldo: number;
  aPagar: number;
  aReceber: number;
  porCategoria: { categoria: string; rotulo: string; centavos: number }[];
};

/**
 * Resumo de uma competencia.
 *
 * Separa o que ja foi pago do que esta previsto: um mes com R$ 40 mil de
 * receita lancada e R$ 38 mil ainda por receber nao e um mes bom, e um total
 * unico esconderia isso.
 */
export function resumoDoMes(
  lancamentos: Lancamento[],
  competencia: string,
): Resumo {
  const doMes = lancamentos.filter((l) => l.competencia === competencia);

  let receitas = 0;
  let despesas = 0;
  let aPagar = 0;
  let aReceber = 0;
  const porCategoria = new Map<string, number>();

  for (const l of doMes) {
    const pago = l.pagoEm !== null;
    if (l.tipo === "RECEITA") {
      if (pago) receitas += l.valorCentavos;
      else aReceber += l.valorCentavos;
    } else {
      if (pago) despesas += l.valorCentavos;
      else aPagar += l.valorCentavos;
      // O grafico de despesa mostra o COMPROMETIDO do mes, pago ou nao: e o
      // que o escritorio precisa olhar para decidir gastar mais.
      const chave = l.categoria ?? "OUTRAS_DESPESAS";
      porCategoria.set(chave, (porCategoria.get(chave) ?? 0) + l.valorCentavos);
    }
  }

  return {
    receitas,
    despesas,
    saldo: receitas - despesas,
    aPagar,
    aReceber,
    porCategoria: [...porCategoria.entries()]
      .map(([categoria, centavos]) => ({
        categoria,
        rotulo: rotuloDaCategoria(categoria),
        centavos,
      }))
      .sort((a, b) => b.centavos - a.centavos),
  };
}

/**
 * Fatias do grafico de pizza, ja com o angulo acumulado.
 *
 * Calculado aqui, e nao no componente, porque arredondamento de porcentagem e
 * onde a pizza deixa de fechar 100% e aparece um risco branco no desenho.
 */
export function fatias(
  porCategoria: { categoria: string; rotulo: string; centavos: number }[],
): {
  categoria: string;
  rotulo: string;
  centavos: number;
  porcentagem: number;
  de: number;
  ate: number;
}[] {
  const total = porCategoria.reduce((s, c) => s + c.centavos, 0);
  if (total <= 0) return [];

  let acumulado = 0;
  return porCategoria.map((c, i) => {
    const de = acumulado;
    // A ultima fatia fecha o circulo por construcao, em vez de por sorte do
    // arredondamento.
    const ate =
      i === porCategoria.length - 1 ? 360 : de + (c.centavos / total) * 360;
    acumulado = ate;
    return {
      ...c,
      porcentagem: (c.centavos / total) * 100,
      de,
      ate,
    };
  });
}

/**
 * Vencimento de uma despesa fixa numa competencia.
 *
 * Dia 31 em mes de 30 cai no ultimo dia do mes, que e o que qualquer boleto
 * faz — e nao no dia 1 do mes seguinte, que e o que o Date faria sozinho.
 */
export function vencimentoNaCompetencia(
  competencia: string,
  dia: number,
): Date | null {
  const casa = competencia.match(/^(\d{4})-(\d{2})$/);
  if (!casa) return null;
  const ano = Number(casa[1]);
  const mes = Number(casa[2]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes - 1, Math.min(dia, ultimoDia), 12, 0));
}
