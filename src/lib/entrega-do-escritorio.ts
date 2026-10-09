// Entrega das mensagens, no banco: o retorno da Meta, o alerta para quem enviou,
// o reenvio (automatico ou a pedido) e a lista da tela "Mensagens nao
// entregues". As regras moram em entrega.ts; ver docs/ENTREGA-DE-MENSAGENS.md.
import { Prisma } from "@prisma/client";
import { comEscritorio, prismaPlataforma, semEscritorio } from "./prisma";
import { enfileirar } from "./fila";
import { dominioDaPlataforma } from "./dominio";
import { dataHoraBR } from "./datas";
import { paraE164BR } from "./whatsapp";
import { rotuloDoAviso } from "./agenda-rotulos";
import { moduloAtivo } from "./modulos";
import { limparParametro, modeloDoTipo } from "./modelos-whatsapp";
import {
  O_QUE_FAZER,
  PREFIXO_DO_REENVIO_AUTOMATICO,
  TRATAMENTOS,
  categoriaDaFalha,
  motivoDaFalha,
  mudancaPorStatus,
  quandoReenviarSozinho,
  semConfirmacao,
  HORAS_SEM_CONFIRMACAO,
  type Categoria,
  type Tratamento,
} from "./entrega";

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

/** O alerta que vai para a equipe. Ele mesmo nunca gera alerta: seria um laco. */
export const TIPO_DO_ALERTA = "FALHA_DE_ENTREGA";

export class NaoDaParaReenviar extends Error {
  readonly status = 422;
  constructor(motivo: string) {
    super(motivo);
    this.name = "NaoDaParaReenviar";
  }
}

// ---------------------------------------------------------------------------
// O retorno da Meta
// ---------------------------------------------------------------------------

export type StatusRecebido = {
  idNaMeta: string;
  status: string;
  /** Segundos desde 1970, como a Meta manda. */
  timestamp?: string | null;
  codigo?: number | null;
  titulo?: string | null;
};

export type DesfechoDoStatus = "DESCONHECIDA" | "SEM_MUDANCA" | "ENTREGUE" | "LIDA" | "FALHOU";

/**
 * Grava um retorno da Meta no aviso. Nunca lanca por causa do conteudo: o
 * webhook responde 200 sempre (ver a rota).
 *
 * Mensagem desconhecida e normal: a resposta automatica do WhatsApp nao vira
 * aviso, e o que saiu antes deste retorno existir nao tem o id gravado.
 */
export async function registrarStatus(s: StatusRecebido, agora = new Date()): Promise<DesfechoDoStatus> {
  const aviso = await prismaPlataforma().aviso.findUnique({
    where: { idNaMeta: s.idNaMeta },
    select: { id: true, escritorioId: true, estado: true, entregueEm: true, lidoEm: true },
  });
  if (!aviso) return "DESCONHECIDA";

  const segundos = Number(s.timestamp);
  const quando = Number.isFinite(segundos) && segundos > 0 ? new Date(segundos * 1000) : agora;
  const mudanca = mudancaPorStatus(aviso, s.status, quando);
  if (!mudanca) return "SEM_MUDANCA";

  const data: Prisma.AvisoUpdateInput = { ...mudanca };
  if (mudanca.estado === "FALHOU") {
    data.erroCodigo = s.codigo ?? null;
    data.erro = motivoDaFalha(s.codigo, s.titulo).slice(0, 500);
  }
  // A condicao no where e a trava contra dois retornos ao mesmo tempo: so
  // um deles muda o estado, e so ele dispara o alerta.
  const r = await comEscritorio(aviso.escritorioId, (db) =>
    db.aviso.updateMany({
      where: { id: aviso.id, ...(mudanca.estado ? { estado: { not: "FALHOU" }, entregueEm: null } : {}) },
      data,
    }),
  );
  if (r.count === 0) return "SEM_MUDANCA";

  if (mudanca.estado === "FALHOU") {
    await depoisDaFalha(aviso.escritorioId, aviso.id, agora);
    return "FALHOU";
  }
  return mudanca.lidoEm ? "LIDA" : "ENTREGUE";
}

// ---------------------------------------------------------------------------
// Depois da falha: reenviar sozinho ou chamar uma pessoa
// ---------------------------------------------------------------------------

type AvisoComCompromisso = Prisma.AvisoGetPayload<{
  include: { compromisso: { select: { titulo: true; inicio: true; responsavelId: true } } };
}>;

/**
 * Chamado quando um aviso vira FALHOU — no envio ou no retorno da Meta.
 *
 * Falha que o sistema reenvia sozinho fica para a fila, na hora certa; as
 * outras viram alerta para a equipe na hora. Problema da plataforma vai
 * tambem para o log, onde a BirdJud ve.
 */
export async function depoisDaFalha(escritorioId: string, avisoId: string, agora = new Date()): Promise<void> {
  const aviso = await comEscritorio(escritorioId, (db) =>
    db.aviso.findFirst({
      where: { id: avisoId },
      include: { compromisso: { select: { titulo: true, inicio: true, responsavelId: true } } },
    }),
  );
  if (!aviso || aviso.estado !== "FALHOU" || aviso.tipo === TIPO_DO_ALERTA) return;

  if (categoriaDaFalha(aviso.canal, aviso.erroCodigo) === "PLATAFORMA") {
    console.error(
      `ALERTA_PLATAFORMA whatsapp: aviso ${aviso.id} do escritorio ${escritorioId} falhou com ${aviso.erroCodigo} — ${aviso.erro}`,
    );
  }

  const quando = quandoReenviarSozinho(paraDecidir(aviso), agora);
  if (quando) {
    await enfileirar("LEMBRAR", escritorioId, {}, quando);
    return;
  }
  if ((await alertarQuemEnviou(escritorioId, aviso)) > 0) await enfileirar("LEMBRAR", escritorioId);
}

function paraDecidir(a: AvisoComCompromisso) {
  return {
    canal: a.canal,
    tipo: a.tipo,
    chave: a.chave,
    erroCodigo: a.erroCodigo,
    falhouEm: a.falhouEm,
    inicioDoCompromisso: a.compromisso?.inicio ?? null,
  };
}

/**
 * Para quem vai o alerta: SO para quem enviou.
 *
 * Quem clicou em Avisar, mandou o documento, reenviou ou marcou o compromisso
 * e quem sabe o que aquela mensagem dizia e quem precisa avisar o cliente por
 * outro meio. Avisar o escritorio inteiro faria cada um achar que e do outro.
 *
 * O que a regua manda sozinha nao tem quem enviou: vale o responsavel do
 * compromisso, em nome de quem ela saiu. So quando nao ha nem um nem outro
 * (pessoa desligada, aviso sem compromisso) vai para os administradores —
 * falha que ninguem fica sabendo e o que este alerta existe para evitar.
 */
async function quemAlertar(
  db: Parameters<Parameters<typeof comEscritorio>[1]>[0],
  aviso: AvisoComCompromisso,
): Promise<{ id: string; email: string; telefone: string | null; recebeWhatsapp: boolean }[]> {
  const campos = { id: true, email: true, telefone: true, recebeWhatsapp: true } as const;
  for (const id of [aviso.enviadoPorId, aviso.compromisso?.responsavelId]) {
    if (!id) continue;
    const pessoa = await db.usuario.findFirst({ where: { id, ativo: true }, select: campos });
    if (pessoa) return [pessoa];
  }
  return db.usuario.findMany({ where: { papel: "ADMIN", ativo: true }, select: campos });
}

/**
 * O alerta: e-mail e, se a pessoa recebe WhatsApp, o modelo
 * birdjud_mensagem_nao_entregue. Um por falha, por pessoa e por canal — a
 * chave garante, e e o que deixa a rotina rodar de novo sem repetir.
 */
async function alertarQuemEnviou(escritorioId: string, aviso: AvisoComCompromisso): Promise<number> {
  const escritorio = await prismaPlataforma().escritorio.findUniqueOrThrow({
    where: { id: escritorioId },
    select: { nome: true, slug: true, telefoneAtendimento: true },
  });
  const destinatario = await nomeDeQuemRecebe(escritorioId, aviso);
  const categoria = categoriaDaFalha(aviso.canal, aviso.erroCodigo);
  const motivo = aviso.erro ?? motivoDaFalha(aviso.erroCodigo);
  const endereco = `https://${escritorio.slug}.${dominioDaPlataforma()}/mensagens`;
  const modelo = modeloDoTipo(TIPO_DO_ALERTA);
  const comWhatsapp = await moduloAtivo(escritorioId, "WHATSAPP");

  return comEscritorio(escritorioId, async (db) => {
    const pessoas = await quemAlertar(db, aviso);

    const canal = aviso.canal === "WHATSAPP" ? "WhatsApp" : "e-mail";
    const corpo = [
      `A mensagem que voce enviou para ${destinatario} nao chegou.`,
      "",
      `O que era: ${rotuloDoAviso(aviso.tipo)} — ${aviso.assunto}`,
      `Por onde: ${canal}, para ${aviso.destino}`,
      aviso.compromisso ? `Compromisso: ${aviso.compromisso.titulo}, ${dataHoraBR.format(aviso.compromisso.inicio)}` : null,
      `Motivo: ${motivo}`,
      "",
      `O que fazer: ${O_QUE_FAZER[categoria]}`,
      "",
      `Reenviar ou marcar como resolvido: ${endereco}`,
      "",
      `— ${escritorio.nome}`,
    ]
      .filter((l) => l !== null)
      .join("\n");

    const criar = async (dados: Omit<Prisma.AvisoUncheckedCreateInput, "escritorioId">): Promise<number> => {
      try {
        await db.aviso.create({ data: semEscritorio(dados) });
        return 1;
      } catch (erro) {
        // Ja alertado: a chave e unica.
        if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") return 0;
        throw erro;
      }
    };

    let criados = 0;
    for (const pessoa of pessoas) {
      const base = {
        usuarioId: pessoa.id,
        tipo: TIPO_DO_ALERTA,
        assunto: `Mensagem nao entregue: ${destinatario}`,
        corpo,
        compromissoId: aviso.compromissoId,
      };
      criados += await criar({ ...base, canal: "EMAIL", chave: `falha:${aviso.id}:${pessoa.id}`, destino: pessoa.email });

      const telefone = pessoa.recebeWhatsapp ? paraE164BR(pessoa.telefone) : null;
      if (!comWhatsapp || !telefone || !modelo) continue;
      criados += await criar({
        ...base,
        canal: "WHATSAPP",
        chave: `zap:falha:${aviso.id}:${pessoa.id}`,
        destino: telefone,
        modelo: modelo.nome,
        parametros: [
          limparParametro(escritorio.nome),
          limparParametro(`${rotuloDoAviso(aviso.tipo)}, por ${canal}`),
          limparParametro(destinatario),
          limparParametro(motivo),
          limparParametro(escritorio.telefoneAtendimento?.trim() || "o escritorio"),
        ],
      });
    }
    return criados;
  });
}

/**
 * A rodada de hora em hora (dentro do LEMBRAR): reenvia o que venceu a
 * espera e alerta o que nao vai ser reenviado. Repetivel: o reenvio
 * automatico e o alerta tem chave unica.
 */
export async function conferirEntregas(escritorioId: string, agora = new Date()): Promise<{ reenviados: number; alertas: number }> {
  const falhas = await comEscritorio(escritorioId, (db) =>
    db.aviso.findMany({
      where: {
        estado: "FALHOU",
        tratadoEm: null,
        tipo: { not: TIPO_DO_ALERTA },
        falhouEm: { gte: new Date(agora.getTime() - 7 * DIA) },
      },
      include: { compromisso: { select: { titulo: true, inicio: true, responsavelId: true } } },
      orderBy: { falhouEm: "asc" },
      take: 200,
    }),
  );

  let reenviados = 0;
  let alertas = 0;
  for (const f of falhas) {
    const quando = quandoReenviarSozinho(paraDecidir(f), agora);
    if (quando && quando > agora) continue;
    if (quando) {
      try {
        await reenviar(escritorioId, f.id, { automatico: true, quem: "Sistema" });
        reenviados += 1;
        continue;
      } catch (erro) {
        if (!(erro instanceof NaoDaParaReenviar)) throw erro;
        // Sem como reenviar (contato apagado, pessoa bloqueou): vai para a equipe.
      }
    }
    alertas += await alertarQuemEnviou(escritorioId, f);
  }
  return { reenviados, alertas };
}

// ---------------------------------------------------------------------------
// Reenviar e resolver
// ---------------------------------------------------------------------------

type ContatoAtual = { telefone: string | null; email: string | null; nome: string | null };

/** O contato de HOJE de quem recebeu: o cadastro corrigido vale no reenvio. */
async function contatoAtual(
  escritorioId: string,
  a: { participanteId: string | null; clienteId: string | null; usuarioId: string | null },
): Promise<ContatoAtual | null> {
  return comEscritorio(escritorioId, async (db) => {
    if (a.participanteId) {
      const p = await db.participanteDeCompromisso.findFirst({
        where: { id: a.participanteId },
        include: { cliente: { select: { nome: true, telefone: true, email: true } } },
      });
      if (p) {
        return {
          telefone: p.telefone ?? paraE164BR(p.cliente?.telefone ?? null),
          email: p.email ?? p.cliente?.email ?? null,
          nome: p.cliente?.nome ?? p.nome ?? null,
        };
      }
    }
    if (a.clienteId) {
      const c = await db.cliente.findFirst({ where: { id: a.clienteId }, select: { nome: true, telefone: true, email: true } });
      if (c) return { telefone: paraE164BR(c.telefone), email: c.email, nome: c.nome };
    }
    if (a.usuarioId) {
      const u = await db.usuario.findFirst({ where: { id: a.usuarioId }, select: { nome: true, telefone: true, email: true } });
      if (u) return { telefone: paraE164BR(u.telefone), email: u.email, nome: u.nome };
    }
    return null;
  });
}

async function nomeDeQuemRecebe(
  escritorioId: string,
  a: { participanteId: string | null; clienteId: string | null; usuarioId: string | null; destino: string },
): Promise<string> {
  return (await contatoAtual(escritorioId, a))?.nome ?? a.destino;
}

/**
 * Manda de novo. O aviso original fica como estava (e a prova da falha) e
 * ganha o tratamento; o novo entra na fila e sai na proxima passada do
 * trabalhador, que a gente chama na hora.
 */
export async function reenviar(
  escritorioId: string,
  avisoId: string,
  opcoes: { automatico: boolean; quem: string; quemId?: string | null },
): Promise<{ novoId: string; destino: string; mudouDestino: boolean }> {
  const original = await comEscritorio(escritorioId, (db) => db.aviso.findFirst({ where: { id: avisoId } }));
  if (!original) throw new NaoDaParaReenviar("Mensagem nao encontrada.");
  if (original.tratadoEm) throw new NaoDaParaReenviar("Esta mensagem ja foi tratada.");
  if (original.estado !== "FALHOU" && original.estado !== "ENVIADO") {
    throw new NaoDaParaReenviar("So da para reenviar mensagem que falhou ou que nao teve entrega confirmada.");
  }
  if (original.tipo === "DOCUMENTO") {
    throw new NaoDaParaReenviar("Documento se manda de novo pela ficha do cliente: o PDF e gerado na hora.");
  }
  if (original.tipo === TIPO_DO_ALERTA) throw new NaoDaParaReenviar("Alerta interno nao se reenvia.");

  const contato = await contatoAtual(escritorioId, original);
  const novoDestino =
    (original.canal === "WHATSAPP" ? contato?.telefone : contato?.email?.trim()) || original.destino;

  const novoId = await comEscritorio(escritorioId, async (db) => {
    if (original.canal === "WHATSAPP") {
      const bloqueado = await db.bloqueioDeWhatsapp.findFirst({ where: { telefone: novoDestino }, select: { id: true } });
      if (bloqueado) {
        throw new NaoDaParaReenviar("A pessoa pediu para nao receber mais mensagens deste escritorio no WhatsApp.");
      }
    }
    const chave = opcoes.automatico
      ? `${PREFIXO_DO_REENVIO_AUTOMATICO}${original.id}`
      : `reenvio:${original.id}:${Date.now()}`;
    let novo: { id: string };
    try {
      novo = await db.aviso.create({
        data: semEscritorio({
          usuarioId: original.usuarioId,
          canal: original.canal,
          tipo: original.tipo,
          chave,
          destino: novoDestino,
          assunto: original.assunto,
          corpo: original.corpo,
          modelo: original.modelo,
          parametros: original.parametros ?? undefined,
          compromissoId: original.compromissoId,
          participanteId: original.participanteId,
          clienteId: original.clienteId,
          reenvioDeId: original.id,
          // O reenvio automatico continua sendo de quem enviou; o manual passa
          // a ser de quem clicou — e e essa pessoa que o alerta procura.
          enviadoPorId: opcoes.automatico ? original.enviadoPorId : (opcoes.quemId ?? null),
        }),
        select: { id: true },
      });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
        throw new NaoDaParaReenviar("O reenvio desta mensagem ja foi feito.");
      }
      throw erro;
    }
    await db.aviso.update({
      where: { id: original.id },
      data: {
        tratamento: opcoes.automatico ? "REENVIO_AUTOMATICO" : "REENVIADO",
        tratadoEm: new Date(),
        tratadoPor: opcoes.quem,
        observacao: novoDestino !== original.destino ? `Reenviada para ${novoDestino}.` : null,
      },
    });
    return novo.id;
  });

  if (!opcoes.automatico) await enfileirar("LEMBRAR", escritorioId);
  return { novoId, destino: novoDestino, mudouDestino: novoDestino !== original.destino };
}

/** A equipe resolveu sem reenviar: ligou, falou pessoalmente, ou nao precisa mais. */
export async function marcarResolvida(
  escritorioId: string,
  avisoId: string,
  tratamento: Extract<Tratamento, "CONTATO_DIRETO" | "DESCARTADO">,
  quem: string,
  observacao: string | null,
): Promise<void> {
  const r = await comEscritorio(escritorioId, (db) =>
    db.aviso.updateMany({
      where: { id: avisoId, tratadoEm: null, estado: { in: ["FALHOU", "ENVIADO"] } },
      data: { tratamento, tratadoEm: new Date(), tratadoPor: quem, observacao: observacao?.trim().slice(0, 500) || null },
    }),
  );
  if (r.count === 0) throw new NaoDaParaReenviar("Mensagem nao encontrada ou ja tratada.");
}

// ---------------------------------------------------------------------------
// A tela
// ---------------------------------------------------------------------------

export type MensagemNaTela = {
  id: string;
  canal: string;
  tipo: string;
  rotulo: string;
  assunto: string;
  corpo: string;
  destino: string;
  destinatario: string;
  quando: string;
  motivo: string | null;
  categoria: Categoria | null;
  oQueFazer: string | null;
  /** Reenvio automatico ja marcado. */
  reenvioAutomaticoEm: string | null;
  /** Como foi o mesmo aviso pelo outro canal. */
  outroCanal: { canal: string; situacao: string } | null;
  compromisso: { id: string; titulo: string; inicio: string } | null;
  clienteId: string | null;
  podeReenviar: boolean;
  tratamento: string | null;
  tratadoEm: string | null;
  tratadoPor: string | null;
  observacao: string | null;
};

export type MensagensDoEscritorio = {
  naoEntregues: MensagemNaTela[];
  semConfirmacao: MensagemNaTela[];
  resolvidas: MensagemNaTela[];
};

/** O par do aviso no outro canal: "zap:X" e "X" nasceram juntos. */
function chaveDoPar(chave: string): string {
  return chave.startsWith("zap:") ? chave.slice(4) : `zap:${chave}`;
}

function situacaoDoPar(p: { estado: string; canal: string; entregueEm: Date | null; lidoEm: Date | null }): string {
  if (p.estado === "FALHOU") return "tambem falhou";
  if (p.estado === "PENDENTE") return "na fila";
  if (p.estado === "CANCELADO") return "cancelado";
  if (p.lidoEm) return "lido";
  if (p.entregueEm) return "entregue";
  return p.canal === "EMAIL" ? "enviado" : "enviado, sem confirmacao";
}

const quandoBR = (d: Date) => dataHoraBR.format(d);

export async function mensagensDoEscritorio(escritorioId: string, agora = new Date()): Promise<MensagensDoEscritorio> {
  const incluir = {
    usuario: { select: { nome: true } },
    compromisso: {
      select: {
        id: true,
        titulo: true,
        inicio: true,
        responsavelId: true,
        participantes: {
          select: {
            id: true,
            nome: true,
            telefone: true,
            email: true,
            cliente: { select: { nome: true, telefone: true, email: true } },
          },
        },
      },
    },
  } satisfies Prisma.AvisoInclude;

  // O ultimo "entregue" que a plataforma recebeu: so e "sem confirmacao" o
  // que saiu ANTES dele. Sem isto, um dia sem retorno da Meta (webhook fora)
  // pintaria toda mensagem do dia como nao recebida.
  const ultimoRetorno = await prismaPlataforma().aviso.findFirst({
    where: { entregueEm: { not: null } },
    orderBy: { entregueEm: "desc" },
    select: { entregueEm: true },
  });

  const { falhas, enviados, resolvidas, clientes } = await comEscritorio(escritorioId, async (db) => {
    const falhas = await db.aviso.findMany({
      where: { estado: "FALHOU", tratadoEm: null, tipo: { not: TIPO_DO_ALERTA } },
      include: incluir,
      orderBy: [{ falhouEm: { sort: "desc", nulls: "last" } }, { criadoEm: "desc" }],
      take: 200,
    });
    const enviados = ultimoRetorno?.entregueEm
      ? await db.aviso.findMany({
          where: {
            canal: "WHATSAPP",
            estado: "ENVIADO",
            tratadoEm: null,
            idNaMeta: { not: null },
            entregueEm: null,
            enviadoEm: {
              lte: new Date(Math.min(agora.getTime() - HORAS_SEM_CONFIRMACAO * HORA, ultimoRetorno.entregueEm.getTime())),
              gte: new Date(agora.getTime() - 14 * DIA),
            },
          },
          include: incluir,
          orderBy: { enviadoEm: "desc" },
          take: 200,
        })
      : [];
    const resolvidas = await db.aviso.findMany({
      where: { tratadoEm: { gte: new Date(agora.getTime() - 30 * DIA) } },
      include: incluir,
      orderBy: { tratadoEm: "desc" },
      take: 100,
    });
    const idsDeCliente = [...new Set([...falhas, ...enviados, ...resolvidas].map((a) => a.clienteId).filter(Boolean))] as string[];
    const clientes = idsDeCliente.length
      ? await db.cliente.findMany({ where: { id: { in: idsDeCliente } }, select: { id: true, nome: true } })
      : [];
    return { falhas, enviados, resolvidas, clientes };
  });

  const todas = [...falhas, ...enviados, ...resolvidas];
  const pares = await comEscritorio(escritorioId, (db) =>
    db.aviso.findMany({
      where: { chave: { in: todas.map((a) => chaveDoPar(a.chave)) } },
      select: { chave: true, canal: true, estado: true, entregueEm: true, lidoEm: true },
    }),
  );
  const parPorChave = new Map(pares.map((p) => [p.chave, p]));
  const nomeDoCliente = new Map(clientes.map((c) => [c.id, c.nome]));

  type Linha = (typeof todas)[number];
  const montar = (a: Linha): MensagemNaTela => {
    const categoria = a.estado === "FALHOU" ? categoriaDaFalha(a.canal, a.erroCodigo) : null;
    const participante = a.participanteId
      ? a.compromisso?.participantes.find((p) => p.id === a.participanteId)
      : undefined;
    const reenvio =
      a.estado === "FALHOU" && !a.tratadoEm
        ? quandoReenviarSozinho(
            {
              canal: a.canal,
              tipo: a.tipo,
              chave: a.chave,
              erroCodigo: a.erroCodigo,
              falhouEm: a.falhouEm,
              inicioDoCompromisso: a.compromisso?.inicio ?? null,
            },
            agora,
          )
        : null;
    const par = parPorChave.get(chaveDoPar(a.chave));
    return {
      id: a.id,
      canal: a.canal,
      tipo: a.tipo,
      rotulo: rotuloDoAviso(a.tipo),
      assunto: a.assunto,
      corpo: a.corpo,
      destino: a.destino,
      destinatario:
        a.usuario?.nome ??
        participante?.cliente?.nome ??
        participante?.nome ??
        (a.clienteId ? nomeDoCliente.get(a.clienteId) : undefined) ??
        nomePeloContato(a) ??
        a.destino,
      quando: quandoBR(a.falhouEm ?? a.enviadoEm ?? a.criadoEm),
      motivo:
        a.estado === "FALHOU"
          ? (a.erro ?? motivoDaFalha(a.erroCodigo))
          : a.tratadoEm
            ? null
            : `Aceita pela Meta ha mais de ${HORAS_SEM_CONFIRMACAO} horas e sem confirmacao de que chegou ao celular (desligado, sem internet ou sem o aplicativo).`,
      categoria,
      oQueFazer: categoria ? O_QUE_FAZER[categoria] : a.tratadoEm ? null : "Reenvie, ou ligue para confirmar que a pessoa recebeu.",
      reenvioAutomaticoEm: reenvio ? quandoBR(reenvio) : null,
      outroCanal: par ? { canal: par.canal === "WHATSAPP" ? "WhatsApp" : "E-mail", situacao: situacaoDoPar(par) } : null,
      compromisso: a.compromisso
        ? { id: a.compromisso.id, titulo: a.compromisso.titulo, inicio: quandoBR(a.compromisso.inicio) }
        : null,
      clienteId: a.clienteId,
      podeReenviar: !a.tratadoEm && a.tipo !== "DOCUMENTO",
      tratamento: a.tratamento ? (TRATAMENTOS[a.tratamento as Tratamento] ?? a.tratamento) : null,
      tratadoEm: a.tratadoEm ? quandoBR(a.tratadoEm) : null,
      tratadoPor: a.tratadoPor,
      observacao: a.observacao,
    };
  };

  return {
    naoEntregues: falhas.map(montar),
    semConfirmacao: enviados.filter((a) => semConfirmacao(a, agora)).map(montar),
    resolvidas: resolvidas.map(montar),
  };
}

/** Nome pelo contato, para os avisos antigos que nao guardaram de quem eram. */
function nomePeloContato(a: {
  destino: string;
  compromisso: {
    participantes: { nome: string | null; telefone: string | null; email: string | null; cliente: { nome: string; telefone: string | null; email: string | null } | null }[];
  } | null;
}): string | null {
  const alvo = a.destino.trim().toLowerCase();
  const digitos = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "");
  for (const p of a.compromisso?.participantes ?? []) {
    const emails = [p.email, p.cliente?.email].map((e) => e?.trim().toLowerCase());
    const fones = [p.telefone, paraE164BR(p.cliente?.telefone ?? null)].map(digitos);
    if (emails.includes(alvo) || fones.includes(digitos(a.destino))) return p.cliente?.nome ?? p.nome ?? null;
  }
  return null;
}

/** Para o painel do Inicio: quantas pedem alguem. */
export async function contarParaOPainel(escritorioId: string, agora = new Date()): Promise<number> {
  const m = await mensagensDoEscritorio(escritorioId, agora);
  return m.naoEntregues.length + m.semConfirmacao.length;
}
