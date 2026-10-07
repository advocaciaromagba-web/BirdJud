// Tipos do helper de repeticao, para o teste em TypeScript enxergar o .mjs.
export interface OpcoesDeEspera {
  tentativas?: number;
  esperaMs?: number;
  fator?: number;
}
export interface OpcoesDeTentativa extends OpcoesDeEspera {
  rotulo?: string;
}
export declare const PADRAO: Required<OpcoesDeEspera>;
export declare function esperasDe(opcoes?: OpcoesDeEspera): number[];
export declare function tentar<T>(
  acao: (vez: number) => T | Promise<T>,
  opcoes?: OpcoesDeTentativa,
): Promise<T>;
