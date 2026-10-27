// A parte pura da tela da agenda: tipos, rotulos, busca e status. Sem React,
// para ter teste — e porque o Vitest nao le JSX.
import type {
  ParticipanteNaLista,
  RespostaDoParticipante,
} from "@/componentes/ParticipantesDoCompromisso";

export type CompromissoNaTela = {
  id: string;
  titulo: string;
  tipo: string;
  inicioISO: string;
  local: string | null;
  link: string | null;
  observacoes: string | null;
  concluido: boolean;
  processoId: string | null;
  numeroProcesso: string | null;
  clienteId: string | null;
  nomeDoCliente: string | null;
  responsavelId: string | null;
  nomeDoResponsavel: string | null;
  /** Audiencia ou pericia com responsavel que nao e advogado (aviso, nao bloqueio). */
  atoSemAdvogado?: boolean;
  participantes: ParticipanteNaLista[];
  nomesDosParticipantes: string[];
  respostas: RespostaDoParticipante[];
};

export const ROTULO_DO_TIPO: Record<string, string> = {
  COMPROMISSO: "Atendimento / reunião",
  AUDIENCIA: "Audiencia",
  PERICIA: "Pericia",
  PRAZO: "Prazo",
  TAREFA: "Tarefa",
};

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Onde a busca procura: titulo, tipo, processo, local, quem vai e quem cuida. */
export function combina(c: CompromissoNaTela, busca: string): boolean {
  const termo = normalizar(busca.trim());
  if (!termo) return true;
  const texto = normalizar(
    [
      c.titulo,
      ROTULO_DO_TIPO[c.tipo] ?? c.tipo,
      c.numeroProcesso,
      c.local,
      c.nomeDoCliente,
      c.nomeDoResponsavel,
      ...c.nomesDosParticipantes,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return texto.includes(termo);
}

/** O que a coluna "Status" diz. */
export function statusDe(c: CompromissoNaTela, agora = new Date()): string {
  if (c.concluido) return "Concluido";
  if (new Date(c.inicioISO).getTime() < agora.getTime()) return "Passou";
  return "Agendado";
}

/**
 * Audiencia e pericia sao atos privativos de advogado (EAOAB, art. 1o).
 * Responsavel de outro papel vira AVISO, nao bloqueio: ha estagiario que
 * acompanha o ato junto com o advogado, e decidir isso e do escritorio
 * (vindo do sistema da Advocacia Roma, 27/10/2026).
 */
export const ATOS_PRIVATIVOS = new Set(["AUDIENCIA", "PERICIA"]);

export function atoSemAdvogado(tipo: string, papelDoResponsavel: string | null | undefined): boolean {
  if (!ATOS_PRIVATIVOS.has(tipo) || !papelDoResponsavel) return false;
  return papelDoResponsavel !== "ADVOGADO" && papelDoResponsavel !== "ADMIN";
}

export const AVISO_DO_ATO_PRIVATIVO =
  "Audiência e perícia são atos privativos de advogado (EAOAB, art. 1º): confira se um advogado acompanha.";
