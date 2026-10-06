// Quem mais vai ao compromisso.
//
// Audiencia com dois clientes, atendimento com o cliente e o conjuge, reuniao
// com testemunha e preposto. Cada linha e uma pessoa que precisa saber da
// hora e do lugar.
//
// A PESSOA PODE NAO SER CLIENTE. Testemunha e acompanhante nao viram cadastro
// de cliente so para receber um aviso: ficariam para sempre na lista de
// clientes do escritorio, apareceriam na busca, na emissao de cobranca e na
// escolha de quem assina uma procuracao. Entao o participante de fora tem nome
// e contato aqui, e so aqui.
//
// Nada neste arquivo toca banco.
import { paraE164BR } from "./whatsapp";

export { PAPEIS_SUGERIDOS } from "./papeis-de-participante";

export const MAXIMO = 20;

export type ParticipanteEntrada = {
  clienteId?: string | null;
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  papel?: string | null;
  avisar?: boolean;
};

export type ParticipanteLimpo = {
  clienteId: string | null;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  papel: string | null;
  avisar: boolean;
};

export class ParticipanteInvalido extends Error {
  readonly status = 400;
  constructor(motivo: string) {
    super(motivo);
    this.name = "ParticipanteInvalido";
  }
}

function texto(valor: unknown, limite = 120): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim().slice(0, limite);
  return limpo.length > 0 ? limpo : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Limpa a lista antes de gravar.
 *
 * Participante sem cliente E sem nome e uma linha vazia na agenda: nao diz a
 * ninguem quem vai ao forum. Entao ou aponta para um cliente do escritorio, ou
 * traz um nome.
 *
 * O MESMO CLIENTE NAO ENTRA DUAS VEZES, nem o mesmo telefone: duas linhas
 * iguais viram dois avisos para o mesmo celular, e quem recebe conclui que o
 * escritorio esta confuso sobre a propria audiencia.
 */
export function prepararParticipantes(
  entrada: unknown,
): ParticipanteLimpo[] {
  if (entrada === null || entrada === undefined) return [];
  if (!Array.isArray(entrada)) {
    throw new ParticipanteInvalido("Lista de participantes invalida.");
  }
  if (entrada.length > MAXIMO) {
    throw new ParticipanteInvalido(`No maximo ${MAXIMO} participantes.`);
  }

  const limpos: ParticipanteLimpo[] = [];
  const clientesVistos = new Set<string>();
  const telefonesVistos = new Set<string>();

  for (const bruto of entrada as ParticipanteEntrada[]) {
    const clienteId = texto(bruto?.clienteId, 40);
    const nome = texto(bruto?.nome, 200);
    const telefoneBruto = texto(bruto?.telefone, 30);
    const email = texto(bruto?.email, 200);

    if (!clienteId && !nome) {
      throw new ParticipanteInvalido(
        "Participante sem cliente e sem nome: diga quem e.",
      );
    }
    if (email && !EMAIL.test(email)) {
      throw new ParticipanteInvalido(`E-mail invalido: ${email}`);
    }

    // Telefone guardado no formato de envio, nao como foi digitado: assim
    // "(11) 9 9999-0000" e "11999990000" sao a mesma pessoa na hora de nao
    // avisar duas vezes.
    const telefone = telefoneBruto ? paraE164BR(telefoneBruto) : null;
    if (telefoneBruto && !telefone) {
      throw new ParticipanteInvalido(`Telefone invalido: ${telefoneBruto}`);
    }

    if (clienteId) {
      if (clientesVistos.has(clienteId)) {
        throw new ParticipanteInvalido("O mesmo cliente aparece duas vezes.");
      }
      clientesVistos.add(clienteId);
    }
    if (telefone) {
      if (telefonesVistos.has(telefone)) {
        throw new ParticipanteInvalido("O mesmo telefone aparece duas vezes.");
      }
      telefonesVistos.add(telefone);
    }

    limpos.push({
      clienteId,
      // Participante que e cliente nao guarda nome aqui: o nome e o do
      // cadastro, e copiar deixaria os dois diferentes no dia em que alguem
      // corrigisse um deles.
      nome: clienteId ? null : nome,
      telefone,
      email,
      papel: texto(bruto?.papel, 60),
      avisar: bruto?.avisar !== false,
    });
  }

  return limpos;
}

export type ParaAvisar = {
  nome: string;
  telefone: string | null;
  email: string | null;
};

/**
 * Quem da para avisar, e por onde.
 *
 * Quem pediu para nao ser avisado fica de fora, e quem nao tem contato nenhum
 * tambem — avisar sem destino nao e avisar, e a tela precisa poder dizer
 * "fulano nao tem telefone nem e-mail" em vez de fingir que mandou.
 */
export function quemAvisar<T extends { avisar: boolean; telefone: string | null; email: string | null }>(
  participantes: Array<T & { nomeNaTela: string }>,
): Array<ParaAvisar & { origem: T }> {
  return participantes
    .filter((p) => p.avisar && (p.telefone || p.email))
    .map((p) => ({
      nome: p.nomeNaTela,
      telefone: p.telefone,
      email: p.email,
      origem: p,
    }));
}

/** Quem esta na lista mas nao da para avisar, e por que. */
export function semComoAvisar<
  T extends { avisar: boolean; telefone: string | null; email: string | null; nomeNaTela: string },
>(participantes: T[]): string[] {
  return participantes
    .filter((p) => p.avisar && !p.telefone && !p.email)
    .map((p) => p.nomeNaTela);
}
