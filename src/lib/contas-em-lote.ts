// Leitura de varias contas de uma vez (03/11/2026, vindo do sistema da
// Advocacia Roma). Puro: a tela e o teste usam o mesmo.
//
// Cada arquivo e lido na SUA chamada, nunca todos num pedido so: com seis
// boletos juntos, o valor de um encosta no vencimento do outro, e esse erro
// sai caro e passa despercebido. Um arquivo pode ter mais de uma conta (o
// boleto do condominio com a taxa extra), entao cada leitura vira uma lista.
import type { Leitura } from "./leitura-documento";
import { ehCategoria } from "./financeiro";

/** Quantos arquivos sobem ao mesmo tempo. Doze numa chamada so passariam do tempo do proxy. */
export const ARQUIVOS_POR_VEZ = 3;

export type ContaLida = {
  chave: string;
  arquivo: string;
  descricao: string;
  fornecedor: string;
  valor: string;
  vencimento: string;
  categoria: string;
  /** Algum campo veio com leitura duvidosa: a linha pede conferencia. */
  conferir: boolean;
  observacoes: string[];
};

export function contasDaLeitura(leitura: Leitura, arquivo: string, prefixo: string): ContaLida[] {
  const todas = [leitura, ...(leitura.outras ?? [])];
  return todas
    .filter((l) => l.campos.valor?.valor)
    .map((l, i) => {
      const c = l.campos;
      const categoria = c.categoria?.valor ?? "";
      return {
        chave: `${prefixo}-${i}`,
        arquivo,
        descricao: c.descricao?.valor || c.fornecedor?.valor || arquivo.replace(/\.[^.]+$/, ""),
        fornecedor: c.fornecedor?.valor ?? "",
        valor: c.valor?.valor ?? "",
        vencimento: c.vencimento?.valor ?? "",
        categoria: ehCategoria(categoria) ? categoria : "OUTRAS_DESPESAS",
        conferir: Object.values(c).some((x) => x.confianca !== "ALTA"),
        // As observacoes da leitura valem para a primeira conta do arquivo.
        observacoes: i === 0 ? l.observacoes.length ? l.observacoes : leitura.observacoes : l.observacoes,
      };
    });
}

/** Roda `tarefa` sobre a lista, no maximo `porVez` ao mesmo tempo, na ordem. */
export async function emGrupos<T, R>(itens: T[], porVez: number, tarefa: (item: T, indice: number) => Promise<R>): Promise<R[]> {
  const resultados: R[] = new Array(itens.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      resultados[i] = await tarefa(itens[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(porVez, itens.length) }, trabalhador));
  return resultados;
}
