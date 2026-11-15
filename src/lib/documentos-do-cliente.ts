// Quais arquivos do cliente a IA le para completar o cadastro (15/11/2026,
// vindo do sistema da Advocacia Roma). Puro.
//
// Nem tudo que esta guardado serve. Peticao, sentenca, laudo, recibo e boleto
// trazem sobretudo dados de OUTRAS pessoas — parte contraria, juiz, perito —,
// e ler isso para preencher cadastro e pedir para o dado de um terceiro
// entrar no lugar errado. A escolha e pelo nome do arquivo.

export type ArquivoDoCliente = { id: string; nome: string; tipo: string; tamanhoBytes: number };

export const CATEGORIAS = ["PESSOAL", "ENDERECO", "PROCURACAO", "CONTRATO", "DECLARACAO", "CERTIDAO", "GENERICO"] as const;
export type Categoria = (typeof CATEGORIAS)[number];

const chato = (nome: string) =>
  nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[_\-.]+/g, " ");

/** Testado ANTES da inclusao: "comprovante de pagamento" e "comprovante de residencia" comecam igual e sao opostos. */
const FORA =
  /\b(peticao|inicial|contestacao|replica|recurso|apelacao|agravo|embargos|sentenca|acordao|decisao|despacho|intimacao|citacao|mandado|laudo|pericia|parecer|recibo|boleto|guia|darf|nota fiscal|nf|extrato|holerite|contracheque|comprovante de (pagamento|transferencia|deposito|pix)|ata|audiencia|gravacao|orcamento|planilha|calculo)\b/;

const REGRAS: [Categoria, RegExp][] = [
  ["PESSOAL", /\b(rg|cin|cnh|cpf|identidade|habilitacao|documento pessoal|doc pessoal|documentos pessoais|carteira de (identidade|trabalho|motorista)|ctps|passaporte|rne|crnm)\b/],
  ["ENDERECO", /\b(comprovante de (residencia|endereco)|comp residencia|comp endereco|conta de (luz|agua|energia|telefone|internet)|fatura de (luz|agua|energia))\b/],
  ["PROCURACAO", /\b(procuracao|substabelecimento)\b/],
  ["CONTRATO", /\b(contrato)\b/],
  ["DECLARACAO", /\b(declaracao)\b/],
  ["CERTIDAO", /\b(certidao)\b/],
];

/** A categoria do arquivo pelo nome, ou null quando ele nao deve ser lido. */
export function categoriaDoArquivo(nome: string): Categoria | null {
  const n = chato(nome);
  if (FORA.test(n)) return null;
  for (const [categoria, regra] of REGRAS) if (regra.test(n)) return categoria;
  // Nome que nao diz nada (scan0001, IMG_2231, foto do celular): so entra se
  // sobrar vaga, depois dos que dizem o que sao.
  return "GENERICO";
}

/** Seis procuracoes iguais nao ensinam nada que uma nao ensine, e tirariam a vaga do comprovante. */
export const MAXIMO_POR_CATEGORIA = 2;

export function escolherDocumentos(
  arquivos: ArquivoDoCliente[],
  limites: { maximo: number; bytes: number; tiposLidos: (tipo: string) => boolean },
): { escolhidos: (ArquivoDoCliente & { categoria: Categoria })[]; deFora: number } {
  const porCategoria = new Map<Categoria, ArquivoDoCliente[]>();
  let deFora = 0;
  for (const a of arquivos) {
    const categoria = limites.tiposLidos(a.tipo) && a.tamanhoBytes > 0 ? categoriaDoArquivo(a.nome) : null;
    if (!categoria) {
      deFora += 1;
      continue;
    }
    porCategoria.set(categoria, [...(porCategoria.get(categoria) ?? []), a]);
  }
  const escolhidos: (ArquivoDoCliente & { categoria: Categoria })[] = [];
  let bytes = 0;
  for (const categoria of CATEGORIAS) {
    let daCategoria = 0;
    for (const a of porCategoria.get(categoria) ?? []) {
      if (escolhidos.length >= limites.maximo) break;
      if (daCategoria >= MAXIMO_POR_CATEGORIA) break;
      // O que nao cabe no teto de tamanho cede a vez ao proximo, menor.
      if (bytes + a.tamanhoBytes > limites.bytes) continue;
      escolhidos.push({ ...a, categoria });
      bytes += a.tamanhoBytes;
      daCategoria += 1;
    }
  }
  return { escolhidos, deFora: deFora + (arquivos.length - deFora - escolhidos.length) };
}
