// Textos dos avisos. Separados do envio para poderem ser testados e revistos
// sem tocar em SMTP — e porque e aqui que mora o tom com que o escritorio fala
// com a propria equipe.
import { formatarNumeroProcesso } from "./leitura-publicacao";

export type PublicacaoNoResumo = {
  numeroProcesso: string | null;
  tribunal: string | null;
  urgente: boolean;
  prazoDias: number | null;
  texto: string;
};

export type CompromissoNoLembrete = {
  titulo: string;
  tipo: string;
  inicio: Date;
  local: string | null;
  numeroProcesso: string | null;
};

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function recortar(texto: string, limite = 220): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length <= limite ? limpo : `${limpo.slice(0, limite)}…`;
}

export function assuntoDoResumo(quantidade: number, urgentes: number): string {
  const base = `${quantidade} publicac${quantidade === 1 ? "ao" : "oes"} nova${quantidade === 1 ? "" : "s"}`;
  // A urgencia vai no assunto: e o que decide se a pessoa abre agora ou depois.
  return urgentes > 0 ? `[URGENTE] ${base}` : base;
}

export function corpoDoResumo(
  nomeEscritorio: string,
  publicacoes: PublicacaoNoResumo[],
  endereco: string
): string {
  const urgentes = publicacoes.filter((p) => p.urgente);
  const demais = publicacoes.filter((p) => !p.urgente);

  const linhas: string[] = [`${nomeEscritorio} — publicacoes do dia`, ""];

  if (urgentes.length > 0) {
    linhas.push(`URGENTE (${urgentes.length}):`, "");
    for (const publicacao of urgentes) linhas.push(...item(publicacao));
  }
  if (demais.length > 0) {
    linhas.push(`Demais (${demais.length}):`, "");
    for (const publicacao of demais) linhas.push(...item(publicacao));
  }

  linhas.push(
    "Abra o sistema para ler o texto completo e marcar como lida:",
    endereco,
    "",
    "O prazo indicado e leitura automatica do texto e serve como alerta —",
    "confira sempre nos autos."
  );

  return linhas.join("\n");
}

function item(publicacao: PublicacaoNoResumo): string[] {
  const numero = publicacao.numeroProcesso
    ? formatarNumeroProcesso(publicacao.numeroProcesso)
    : "sem numero de processo";
  const prazo = publicacao.prazoDias !== null ? ` · prazo indicado: ${publicacao.prazoDias} dia(s)` : "";
  return [
    `- ${numero}${publicacao.tribunal ? ` (${publicacao.tribunal})` : ""}${prazo}`,
    `  ${recortar(publicacao.texto)}`,
    "",
  ];
}

export function assuntoDoLembrete(compromisso: CompromissoNoLembrete): string {
  return `Lembrete: ${compromisso.titulo} em ${dataHora.format(compromisso.inicio)}`;
}

export function corpoDoLembrete(
  nomeEscritorio: string,
  compromisso: CompromissoNoLembrete,
  endereco: string
): string {
  const linhas = [
    `${nomeEscritorio} — lembrete de compromisso`,
    "",
    compromisso.titulo,
    `${compromisso.tipo} · ${dataHora.format(compromisso.inicio)}`,
  ];

  if (compromisso.local) linhas.push(`Local: ${compromisso.local}`);
  if (compromisso.numeroProcesso) {
    linhas.push(`Processo: ${formatarNumeroProcesso(compromisso.numeroProcesso)}`);
  }

  linhas.push("", "Agenda completa:", endereco);
  return linhas.join("\n");
}
