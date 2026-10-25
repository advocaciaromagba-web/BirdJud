// Avisos de cobranca da plataforma ao escritorio, e a suspensao pelo operador.
//
// A regua (cobranca.ts) ja muda o status sozinha: 5 dias de atraso,
// INADIMPLENTE; 15, SUSPENSO, e o escritorio para de entrar. Ate 25/10/2026
// isso acontecia em silencio: o unico e-mail era o da fatura emitida, e o
// escritorio descobria a suspensao na tela de entrada. Agora cada etapa
// manda um aviso ao(s) administrador(es), uma vez por fatura:
//
//   LEMBRETE           3 dias antes do vencimento
//   VENCEU             1 dia depois
//   INADIMPLENTE       5 dias (diz a data em que o acesso sera suspenso)
//   SUSPENSAO_PROXIMA  3 dias antes da suspensao
//   SUSPENSO           quando sai do ar (regua ou operador)
//   REATIVADO          quando volta, depois de pagar
//
// Aviso perdido (regua parada, sem remetente) nao e mandado atrasado: vai so
// a etapa em que a fatura esta, nunca tres e-mails de uma vez.
import { prismaPlataforma } from "./prisma";
import { REGUA } from "./precos";
import { emReais } from "./dinheiro";
import { enviarPelaPlataforma, temRemetenteDaPlataforma, type MensagemDaPlataforma } from "./email-plataforma";

const DIA = 24 * 60 * 60 * 1000;

export const TIPOS_DE_AVISO = [
  "LEMBRETE",
  "VENCEU",
  "INADIMPLENTE",
  "SUSPENSAO_PROXIMA",
  "SUSPENSO",
  "REATIVADO",
  "MANUAL",
] as const;
export type TipoDeAviso = (typeof TIPOS_DE_AVISO)[number];

export const ROTULO_DO_AVISO: Record<TipoDeAviso, string> = {
  LEMBRETE: "Lembrete de vencimento",
  VENCEU: "Fatura vencida",
  INADIMPLENTE: "Em atraso, com data de suspensão",
  SUSPENSAO_PROXIMA: "Suspensão em 3 dias",
  SUSPENSO: "Acesso suspenso",
  REATIVADO: "Acesso restabelecido",
  MANUAL: "Aviso enviado pelo console",
};

/** Etapas automaticas por fatura, na ordem. */
const ETAPAS: TipoDeAviso[] = ["LEMBRETE", "VENCEU", "INADIMPLENTE", "SUSPENSAO_PROXIMA"];
export const DIAS_DO_LEMBRETE = 3;
const DIAS_ANTES_DA_SUSPENSAO = 3;

/**
 * Em que etapa a fatura esta, pelo atraso em dias (negativo = falta isso para
 * vencer). Nulo: nada a avisar. Com a suspensao adiada pelo operador, nao ha
 * "suspensao em 3 dias" a anunciar.
 */
export function etapaPeloAtraso(atraso: number, suspensaoAdiada = false): TipoDeAviso | null {
  if (atraso >= REGUA.suspenso) return null;
  if (atraso >= REGUA.suspenso - DIAS_ANTES_DA_SUSPENSAO) return suspensaoAdiada ? "INADIMPLENTE" : "SUSPENSAO_PROXIMA";
  if (atraso >= REGUA.inadimplente) return "INADIMPLENTE";
  if (atraso >= 1) return "VENCEU";
  if (atraso >= -DIAS_DO_LEMBRETE) return "LEMBRETE";
  return null;
}

/** A etapa ja foi avisada (ela ou uma posterior) para esta fatura? */
export function jaAvisada(etapa: TipoDeAviso, enviadas: string[]): boolean {
  const i = ETAPAS.indexOf(etapa);
  return enviadas.some((t) => ETAPAS.indexOf(t as TipoDeAviso) >= i);
}

/** Dia em que a regua suspende: vencimento + REGUA.suspenso, ou o adiamento. */
export function dataDaSuspensao(vencimento: Date, adiadaAte?: Date | null): Date {
  const pelaRegua = new Date(vencimento.getTime() + REGUA.suspenso * DIA);
  return adiadaAte && adiadaAte > pelaRegua ? adiadaAte : pelaRegua;
}

const dia = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export type DadosDoAviso = {
  nomeDoEscritorio: string;
  competencia: string | null;
  valorCentavos: number | null;
  vencimento: Date | null;
  link: string | null;
  enderecoDoPlano: string;
  suspensaoEm: Date | null;
};

/** Assunto e texto de cada aviso. Funcao pura. */
export function mensagemDoAviso(tipo: TipoDeAviso, d: DadosDoAviso): Omit<MensagemDaPlataforma, "para"> {
  const fatura =
    d.valorCentavos != null && d.vencimento
      ? `a fatura do BirdJud${d.competencia ? ` de ${d.competencia}` : ""}, de ${emReais(d.valorCentavos)}, com vencimento em ${dia(d.vencimento)}`
      : "a fatura do BirdJud";
  const pagar = d.link
    ? `Para pagar (boleto, Pix ou cartão): ${d.link}`
    : `Para pagar, entre no sistema em ${d.enderecoDoPlano}.`;
  const rodape = ["", "Se o pagamento já foi feito, desconsidere este aviso: a baixa é automática e pode levar até um dia útil.", "", "Equipe BirdJud"];
  const corpo = (linhas: string[]) => [`${d.nomeDoEscritorio},`, "", ...linhas, ...rodape].join("\n");
  const suspensao = d.suspensaoEm ? dia(d.suspensaoEm) : null;

  switch (tipo) {
    case "LEMBRETE":
      return {
        assunto: `BirdJud — sua fatura vence em ${d.vencimento ? dia(d.vencimento) : "breve"}`,
        texto: corpo([`Lembrete: ${fatura}.`, "", pagar]),
      };
    case "VENCEU":
      return {
        assunto: "BirdJud — fatura vencida",
        texto: corpo([`Não identificamos o pagamento de ${fatura}.`, "", pagar]),
      };
    case "INADIMPLENTE":
      return {
        assunto: "BirdJud — fatura em atraso",
        texto: corpo([
          `${fatura[0].toUpperCase()}${fatura.slice(1)} continua em aberto.`,
          suspensao ? `Sem o pagamento, o acesso ao sistema será suspenso em ${suspensao}. Os dados do escritório ficam guardados.` : "",
          "",
          pagar,
        ]),
      };
    case "SUSPENSAO_PROXIMA":
      return {
        assunto: `BirdJud — o acesso será suspenso em ${suspensao ?? "3 dias"}`,
        texto: corpo([
          `${fatura[0].toUpperCase()}${fatura.slice(1)} segue em aberto.`,
          `Em ${suspensao ?? "3 dias"} o acesso ao sistema será suspenso para toda a equipe. Os dados do escritório ficam guardados, e o acesso volta assim que o pagamento for confirmado.`,
          "",
          pagar,
        ]),
      };
    case "SUSPENSO":
      return {
        assunto: "BirdJud — acesso suspenso",
        texto: corpo([
          `O acesso do escritório ao BirdJud foi suspenso por falta de pagamento de ${fatura}.`,
          "Os dados do escritório estão guardados e nada foi apagado. O acesso volta sozinho assim que o pagamento for confirmado.",
          "",
          d.link ? `Para pagar (boleto, Pix ou cartão): ${d.link}` : "Responda a este e-mail para receber o link de pagamento.",
        ]),
      };
    case "REATIVADO":
      return {
        assunto: "BirdJud — acesso restabelecido",
        texto: [`${d.nomeDoEscritorio},`, "", "Recebemos o pagamento e o acesso ao BirdJud está liberado de novo para toda a equipe.", `Endereço: ${d.enderecoDoPlano.replace(/\/plano$/, "")}`, "", "Obrigado,", "Equipe BirdJud"].join("\n"),
      };
    case "MANUAL":
      return {
        assunto: "BirdJud — pendência financeira",
        texto: corpo([
          `Consta em aberto ${fatura}.`,
          suspensao ? `Sem o pagamento, o acesso ao sistema será suspenso em ${suspensao}.` : "",
          "",
          pagar,
        ]),
      };
  }
}

export type Envio = (m: MensagemDaPlataforma) => Promise<void>;

function enderecoDoPlano(slug: string): string {
  return `https://${slug}.${process.env.DOMINIO_PLATAFORMA?.trim() || "birdjud.com.br"}/plano`;
}

/** E-mails de quem recebe: todo administrador ativo do escritorio. */
async function destinatarios(escritorioId: string): Promise<string[]> {
  const admins = await prismaPlataforma().usuario.findMany({
    where: { escritorioId, papel: "ADMIN", ativo: true },
    select: { email: true },
    orderBy: { criadoEm: "asc" },
  });
  return [...new Set(admins.map((a) => a.email.trim().toLowerCase()).filter(Boolean))];
}

/**
 * Manda um aviso e registra. Sem remetente ou sem administrador, nao manda
 * nem registra (a proxima passada tenta de novo). Devolve se saiu.
 */
async function mandar(
  escritorioId: string,
  tipo: TipoDeAviso,
  faturaId: string | null,
  dados: DadosDoAviso,
  enviar: Envio,
  porOperador: string | null = null,
): Promise<boolean> {
  const para = await destinatarios(escritorioId);
  if (!para.length) return false;
  const mensagem = mensagemDoAviso(tipo, dados);
  const mensagemLimpa = { ...mensagem, texto: mensagem.texto.replace(/\n{3,}/g, "\n\n") };
  try {
    for (const email of para) await enviar({ para: email, ...mensagemLimpa });
  } catch (erro) {
    console.error(`avisos: ${tipo} para o escritório ${escritorioId} não saiu — ${(erro as Error).message}`);
    return false;
  }
  await prismaPlataforma().avisoDeCobranca.create({
    data: { escritorioId, faturaId, tipo, para: para.join(", "), porOperador },
  });
  return true;
}

async function dadosDoEscritorio(escritorioId: string) {
  const escritorio = await prismaPlataforma().escritorio.findUniqueOrThrow({
    where: { id: escritorioId },
    select: { nome: true, slug: true, suspensaoAdiadaAte: true },
  });
  const fatura = await prismaPlataforma().fatura.findFirst({
    where: { escritorioId, status: "ABERTA" },
    orderBy: { vencimento: "asc" },
    select: { id: true, competencia: true, valorCentavos: true, vencimento: true, linkPagamento: true, criadaEm: true },
  });
  const dados: DadosDoAviso = {
    nomeDoEscritorio: escritorio.nome,
    competencia: fatura?.competencia ?? null,
    valorCentavos: fatura?.valorCentavos ?? null,
    vencimento: fatura?.vencimento ?? null,
    link: fatura?.linkPagamento ?? null,
    enderecoDoPlano: enderecoDoPlano(escritorio.slug),
    // O motivo da suspensao manual e anotacao do operador: nao vai ao cliente.
    suspensaoEm: fatura ? dataDaSuspensao(fatura.vencimento, escritorio.suspensaoAdiadaAte) : null,
  };
  return { escritorio, fatura, dados };
}

/**
 * Chamado pela regua depois de acertar o status. Manda o aviso da mudanca de
 * status (SUSPENSO, REATIVADO) ou, sem mudanca, o da etapa em que a fatura
 * mais antiga em aberto esta. Devolve o que saiu.
 */
export async function avisarCobranca(
  escritorioId: string,
  status: { anterior: string; novo: string },
  agora = new Date(),
  enviar: Envio = enviarPelaPlataforma,
): Promise<TipoDeAviso[]> {
  if (enviar === enviarPelaPlataforma && !temRemetenteDaPlataforma()) return [];
  const { escritorio, fatura, dados } = await dadosDoEscritorio(escritorioId);

  if (status.novo === "SUSPENSO" && status.anterior !== "SUSPENSO") {
    return (await mandar(escritorioId, "SUSPENSO", fatura?.id ?? null, dados, enviar)) ? ["SUSPENSO"] : [];
  }
  if (status.anterior === "SUSPENSO" && status.novo === "ATIVO") {
    return (await mandar(escritorioId, "REATIVADO", null, dados, enviar)) ? ["REATIVADO"] : [];
  }
  if (!fatura || status.novo === "SUSPENSO" || status.novo === "ENCERRADO") return [];

  const atraso = Math.floor((agora.getTime() - fatura.vencimento.getTime()) / DIA);
  const adiada = Boolean(escritorio.suspensaoAdiadaAte && escritorio.suspensaoAdiadaAte > agora);
  const etapa = etapaPeloAtraso(atraso, adiada);
  if (!etapa) return [];
  // O lembrete repetiria o e-mail da fatura, se ela acabou de sair.
  if (etapa === "LEMBRETE" && agora.getTime() - fatura.criadaEm.getTime() < 2 * DIA) return [];

  const enviadas = await prismaPlataforma().avisoDeCobranca.findMany({
    where: { faturaId: fatura.id, tipo: { in: ETAPAS } },
    select: { tipo: true },
  });
  if (jaAvisada(etapa, enviadas.map((e) => e.tipo))) return [];
  return (await mandar(escritorioId, etapa, fatura.id, dados, enviar)) ? [etapa] : [];
}

export class AcaoDeCobrancaRecusada extends Error {
  readonly status = 400;
  constructor(motivo: string) {
    super(motivo);
    this.name = "AcaoDeCobrancaRecusada";
  }
}

/** Aviso mandado agora pelo operador, fora da regua. */
export async function avisarAgora(
  escritorioId: string,
  operador: string,
  enviar: Envio = enviarPelaPlataforma,
): Promise<string[]> {
  if (enviar === enviarPelaPlataforma && !temRemetenteDaPlataforma()) {
    throw new AcaoDeCobrancaRecusada("A plataforma está sem remetente de e-mail configurado.");
  }
  const { fatura, dados } = await dadosDoEscritorio(escritorioId);
  if (!fatura) throw new AcaoDeCobrancaRecusada("Este escritório não tem fatura em aberto.");
  const para = await destinatarios(escritorioId);
  if (!para.length) throw new AcaoDeCobrancaRecusada("O escritório não tem administrador ativo para receber o aviso.");
  const saiu = await mandar(escritorioId, "MANUAL", fatura.id, dados, enviar, operador);
  if (!saiu) throw new AcaoDeCobrancaRecusada("O e-mail não saiu. Veja o registro da aplicação.");
  return para;
}

/**
 * Suspensao pelo operador, antes dos 15 dias da regua. So para quem tem
 * fatura vencida: para tirar do ar por outro motivo, o caminho e encerrar.
 * Fica suspenso ate pagar tudo o que esta vencido ou o operador liberar.
 */
export async function suspenderPorAtraso(
  escritorioId: string,
  pedido: { motivo: string; avisar: boolean; operador: string },
  agora = new Date(),
  enviar: Envio = enviarPelaPlataforma,
): Promise<{ avisado: boolean }> {
  const escritorio = await prismaPlataforma().escritorio.findUniqueOrThrow({
    where: { id: escritorioId },
    select: { status: true },
  });
  if (escritorio.status === "ENCERRADO") throw new AcaoDeCobrancaRecusada("Escritório encerrado não se suspende.");
  if (escritorio.status === "SUSPENSO") throw new AcaoDeCobrancaRecusada("O escritório já está suspenso.");
  const vencida = await prismaPlataforma().fatura.findFirst({
    where: { escritorioId, status: "ABERTA", vencimento: { lt: agora } },
    select: { id: true },
  });
  if (!vencida) {
    throw new AcaoDeCobrancaRecusada("Sem fatura vencida, não há suspensão por atraso. Para tirar do ar por outro motivo, use Encerrar.");
  }
  const motivo = pedido.motivo.trim();
  if (motivo.length < 5) throw new AcaoDeCobrancaRecusada("Escreva o motivo: fica no registro.");

  await prismaPlataforma().escritorio.update({
    where: { id: escritorioId },
    data: { status: "SUSPENSO", suspensoEm: agora, suspensaoManual: true, suspensaoMotivo: motivo, suspensaoAdiadaAte: null },
  });
  if (!pedido.avisar) return { avisado: false };
  if (enviar === enviarPelaPlataforma && !temRemetenteDaPlataforma()) return { avisado: false };
  const { dados } = await dadosDoEscritorio(escritorioId);
  return { avisado: await mandar(escritorioId, "SUSPENSO", vencida.id, dados, enviar, pedido.operador) };
}
