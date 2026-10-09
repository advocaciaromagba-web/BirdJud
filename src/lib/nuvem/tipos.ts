// O que o sistema pede a uma nuvem. OneDrive e Google Drive implementam isto;
// o resto do sistema nao sabe qual dos dois esta do outro lado.
import type { Provedor } from "./estado";

export type Pasta = { id: string; endereco: string | null };

export type ItemNaNuvem = {
  id: string;
  nome: string;
  pasta: boolean;
  criadoEm: string | null;
  endereco: string | null;
};

export type Tokens = {
  acesso: string;
  /** Vem quando o provedor trocou o token de renovacao: e preciso guardar o novo. */
  renovacao?: string;
};

export type ContaConectada = {
  renovacao: string;
  /** E-mail da conta, para a tela dizer qual conta esta ligada. */
  conta: string | null;
};

export interface Nuvem {
  provedor: Provedor;
  rotulo: string;
  /** O aplicativo da plataforma esta registrado (variaveis definidas)? */
  configurada(): boolean;
  urlDeAutorizacao(estado: string, retorno: string): string;
  trocarCodigo(codigo: string, retorno: string): Promise<ContaConectada>;
  renovar(renovacao: string): Promise<Tokens>;
  /** Acha a pasta pelo nome dentro do pai, ou cria. paiId null = raiz da conta. */
  garantirPasta(acesso: string, paiId: string | null, nome: string): Promise<Pasta>;
  /** Pasta ainda existe (e nao esta na lixeira)? */
  pastaExiste(acesso: string, id: string): Promise<Pasta | null>;
  enviar(
    acesso: string,
    pastaId: string,
    nome: string,
    tipo: string,
    conteudo: Buffer,
  ): Promise<{ id: string }>;
  listar(acesso: string, pastaId: string): Promise<ItemNaNuvem[]>;
}

/** Erro do provedor, com o status para quem chama decidir o que fazer. */
export class FalhaNaNuvem extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
    /** Token de renovacao revogado ou vencido: so reconectando. */
    readonly precisaReconectar = false,
  ) {
    super(mensagem);
    this.name = "FalhaNaNuvem";
  }
}

/** Nome que as duas nuvens aceitam: sem \ / : * ? " < > | e sem espaco sobrando. */
export function nomeSeguro(texto: string): string {
  const limpo = texto
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "");
  return (limpo || "sem nome").slice(0, 200);
}
