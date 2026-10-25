// Quem pode receber mensagem automatica do escritorio, e por qual canal.
//
// Veio do sistema da Advocacia Roma (24/10/2026). Tres decisoes:
//
// 1. Desligar nao apaga o contato. Telefone e e-mail continuam no cadastro:
//    a equipe ainda liga e escreve a mao. O que a chave impede e o sistema
//    mandar sozinho.
// 2. O bloqueio aparece como falha explicada, nunca como silencio: quem
//    clicou em "enviar" precisa saber que nao saiu e por que.
// 3. Vale para tudo que o sistema manda ao cliente: aviso e lembrete de
//    compromisso, cobranca, recibo, nota fiscal e documento. Sem excecao "so
//    esta vez" — e ela que faz o cliente que pediu silencio continuar
//    recebendo.
//
// Participante avulso de compromisso (testemunha, preposto) nao tem cadastro
// e portanto nao tem chave: quem nao quer receber sai da lista.

export type CanalDeEnvio = "WHATSAPP" | "EMAIL";

export type ChavesDeEnvio = {
  nome?: string | null;
  notificarWhatsapp?: boolean | null;
  notificarEmail?: boolean | null;
};

/** Ausente conta como ligado: cadastro antigo nao emudece sozinho. */
export function podeReceber(pessoa: ChavesDeEnvio | null | undefined, canal: CanalDeEnvio): boolean {
  if (!pessoa) return true;
  const chave = canal === "WHATSAPP" ? pessoa.notificarWhatsapp : pessoa.notificarEmail;
  return chave !== false;
}

/** Texto da falha, no tom das outras da lista de envios. */
export function motivoDoBloqueio(pessoa: ChavesDeEnvio | null | undefined, canal: CanalDeEnvio): string {
  const nome = pessoa?.nome?.trim() || "o cliente";
  return `${canal === "WHATSAPP" ? "WhatsApp" : "E-mail"}: o envio automático para ${nome} está desligado no cadastro.`;
}

export class EnvioDesligado extends Error {
  readonly status = 409;
  constructor(pessoa: ChavesDeEnvio | null | undefined, canal: CanalDeEnvio) {
    super(motivoDoBloqueio(pessoa, canal));
    this.name = "EnvioDesligado";
  }
}
