// Geracao e envio dos avisos do escritorio.
//
// Sao duas etapas separadas de proposito:
//
//   gerar  — decide QUEM recebe O QUE, e grava cada aviso como pendente;
//   enviar — pega os pendentes e entrega pelo canal.
//
// Separadas, a rotina pode rodar de novo sem duplicar (a chave de idempotencia
// resolve), e uma falha de SMTP nao faz o sistema esquecer que devia avisar.
import { comEscritorio, prismaPlataforma, semEscritorio } from "./prisma";
import { enviarLote, SemRemetente, type Mensagem } from "./email";
import { registrarConsumo } from "./consumo";
import { moduloAtivo } from "./modulos";
import {
  enviarModelo,
  FalhaNoWhatsapp,
  paraE164BR,
  SemNumeroDeWhatsapp,
} from "./whatsapp";
import { limparParametro, modeloDoTipo } from "./modelos-whatsapp";
import { dataHoraBR } from "./datas";
import {
  MAIOR_ANTECEDENCIA_HORAS,
  MARCOS,
  TIPOS_COM_REGUA,
  marcoAgora,
  quandoComMarco,
  type Marco,
} from "./regua-de-lembretes";
import {
  assuntoDaDesignacao,
  assuntoDoAgendamento,
  corpoDaDesignacao,
  corpoDoAgendamento,
  assuntoDoLembrete,
  assuntoDoLembreteAoParticipante,
  assuntoDoResumo,
  corpoDoLembrete,
  corpoDoLembreteAoParticipante,
  corpoDoResumo,
} from "./textos-aviso";
import { paraAvisarNoCompromisso } from "./participantes-do-escritorio";
import { CompromissoNaoEncontrado } from "./agenda-do-escritorio";
import { type AvisoManual as Manual } from "./avisos-manuais";
import { dominioDaPlataforma } from "./dominio";
import { depoisDaFalha } from "./entrega-do-escritorio";
import { contasParaAvisar } from "./contas-do-escritorio";
import { fatosDoDia } from "./resumo-do-escritorio";
import {
  corpoDoResumo as corpoDoResumoDoDia,
  montarResumo,
} from "./resumo-do-dia";

const HORA = 60 * 60 * 1000;

/**
 * Antecedencia do lembrete de compromisso.
 *
 * Mantida por compatibilidade: a regua de verdade vive em
 * regua-de-lembretes.ts, com tres marcos (3 dias, 24 horas, 1 hora).
 */
export const ANTECEDENCIA_HORAS = 24;

/**
 * O pedaco do marco dentro da chave do aviso.
 *
 * O marco de 24 HORAS devolve string vazia DE PROPOSITO: e a chave que ja
 * existia antes da regua. Se ele ganhasse prefixo, todo compromisso ja avisado
 * ontem seria avisado de novo no primeiro dia depois do deploy — o cliente
 * receberia duas vezes, e ninguem ligaria uma coisa a outra.
 */
function pedacoDoMarco(marco: Marco): string {
  return marco.chave === "24h" ? "" : `${marco.chave}:`;
}

/** Tentativas de envio antes de o aviso parar em FALHOU. */
export const MAX_TENTATIVAS = 3;

export type ResultadoDaGeracao = {
  resumos: number;
  lembretes: number;
};

/** Quem recebe por WhatsApp: quis receber, tem telefone legivel, e o modulo esta contratado. */
function telefoneDoUsuario(
  usuario: { recebeWhatsapp: boolean; telefone: string | null },
  moduloLigado: boolean,
): string | null {
  if (!moduloLigado || !usuario.recebeWhatsapp) return null;
  return paraE164BR(usuario.telefone);
}

/** Dia em que o aviso foi gerado, para compor a chave: "2026-09-18". */
export function diaDaChave(data: Date): string {
  return data.toISOString().slice(0, 10);
}

export async function gerarAvisos(
  escritorioId: string,
  agora = new Date(),
): Promise<ResultadoDaGeracao> {
  const escritorio = await prismaPlataforma().escritorio.findUniqueOrThrow({
    where: { id: escritorioId },
    select: { nome: true, slug: true, telefoneAtendimento: true },
  });
  const dominio = dominioDaPlataforma();
  const endereco = `https://${escritorio.slug}.${dominio}`;

  const comWhatsapp = await moduloAtivo(escritorioId, "WHATSAPP");

  // O telefone do escritorio entra em TODA mensagem: este numero notifica e
  // nao recebe. Sem telefone cadastrado, a frase diz para procurar o
  // escritorio — melhor que um travessao no meio de "ligue para —".
  const telefone = escritorio.telefoneAtendimento?.trim() || "o escritorio";

  const resumos = await gerarResumos(
    escritorioId,
    escritorio.nome,
    telefone,
    endereco,
    agora,
    comWhatsapp,
  );
  const lembretes = await gerarLembretes(
    escritorioId,
    escritorio.nome,
    telefone,
    endereco,
    agora,
    comWhatsapp,
  );

  return { resumos, lembretes };
}

async function gerarResumos(
  escritorioId: string,
  nomeEscritorio: string,
  telefoneDoEscritorio: string,
  endereco: string,
  agora: Date,
  comWhatsapp: boolean,
): Promise<number> {
  const dia = diaDaChave(agora);

  const { publicacoes, usuarios } = await comEscritorio(
    escritorioId,
    async (db) => ({
      publicacoes: await db.publicacao.findMany({
        where: { lida: false, arquivada: false },
        orderBy: [{ urgente: "desc" }, { dataDisponibilizacao: "desc" }],
        take: 50,
      }),
      usuarios: await db.usuario.findMany({
        where: { ativo: true, recebeResumo: true },
      }),
    }),
  );

  // Sem publicacao nao lida, nao ha resumo. E-mail vazio todo dia treina a
  // equipe a ignorar o remetente — justamente o que nao se pode perder.
  if (publicacoes.length === 0 || usuarios.length === 0) return 0;

  const urgentes = publicacoes.filter((p) => p.urgente).length;
  const assunto = assuntoDoResumo(publicacoes.length, urgentes);
  const corpo = corpoDoResumo(nomeEscritorio, publicacoes, endereco);

  const modelo = modeloDoTipo("RESUMO_PUBLICACOES");

  let criados = 0;
  for (const usuario of usuarios) {
    const criado = await criarAviso(escritorioId, {
      usuarioId: usuario.id,
      canal: "EMAIL",
      tipo: "RESUMO_PUBLICACOES",
      chave: `resumo:${dia}:${usuario.id}`,
      destino: usuario.email,
      assunto,
      corpo,
    });
    if (criado) criados += 1;

    const telefone = telefoneDoUsuario(usuario, comWhatsapp);
    if (!telefone || !modelo) continue;

    const criadoZap = await criarAviso(escritorioId, {
      usuarioId: usuario.id,
      canal: "WHATSAPP",
      tipo: "RESUMO_PUBLICACOES",
      // Chave propria por canal: o mesmo aviso sai uma vez por caminho, e
      // ligar o WhatsApp hoje nao reenvia o e-mail de ontem.
      chave: `zap:resumo:${dia}:${usuario.id}`,
      destino: telefone,
      assunto,
      corpo,
      modelo: modelo.nome,
      parametros: [
        limparParametro(nomeEscritorio),
        String(publicacoes.length),
        String(urgentes),
      ],
    });
    if (criadoZap) criados += 1;
  }
  return criados;
}

async function gerarLembretes(
  escritorioId: string,
  nomeEscritorio: string,
  telefoneDoEscritorio: string,
  endereco: string,
  agora: Date,
  comWhatsapp: boolean,
): Promise<number> {
  const limite = new Date(agora.getTime() + MAIOR_ANTECEDENCIA_HORAS * HORA);

  const { compromissos, usuarios } = await comEscritorio(
    escritorioId,
    async (db) => ({
      compromissos: await db.compromisso.findMany({
        where: { concluido: false, inicio: { gte: agora, lte: limite } },
        include: { processo: { select: { numero: true } } },
        orderBy: { inicio: "asc" },
        take: 100,
      }),
      usuarios: await db.usuario.findMany({
        where: { ativo: true, recebeLembretes: true },
      }),
    }),
  );

  if (compromissos.length === 0 || usuarios.length === 0) return 0;

  const modelo = modeloDoTipo("LEMBRETE_COMPROMISSO");
  const quando = dataHoraBR;

  let criados = 0;
  for (const compromisso of compromissos) {
    // Um marco por rodada. A rotina roda de hora em hora e a chave guarda o
    // que ja saiu, entao quem esta a 50 horas recebe o de 3 dias hoje e o de
    // 24 horas amanha sem que isto aqui precise saber disso.
    const marco = marcoAgora(compromisso.tipo, compromisso.inicio, agora);
    if (!marco) continue;
    const m = pedacoDoMarco(marco);

    const dados = {
      titulo: compromisso.titulo,
      tipo: compromisso.tipo,
      inicio: compromisso.inicio,
      local: compromisso.local,
      numeroProcesso: compromisso.processo?.numero ?? null,
    };
    const assunto = `${assuntoDoLembrete(dados)} (${marco.rotulo})`;
    const corpo = corpoDoLembrete(nomeEscritorio, dados, endereco);

    for (const usuario of usuarios) {
      const criado = await criarAviso(escritorioId, {
        usuarioId: usuario.id,
        canal: "EMAIL",
        tipo: "LEMBRETE_COMPROMISSO",
        compromissoId: compromisso.id,
        // Um lembrete por marco, por compromisso e por pessoa, para sempre.
        chave: `lembrete:${m}${compromisso.id}:${usuario.id}`,
        destino: usuario.email,
        assunto,
        corpo,
      });
      if (criado) criados += 1;

      const telefone = telefoneDoUsuario(usuario, comWhatsapp);
      if (!telefone || !modelo) continue;

      const criadoZap = await criarAviso(escritorioId, {
        usuarioId: usuario.id,
        canal: "WHATSAPP",
        tipo: "LEMBRETE_COMPROMISSO",
        compromissoId: compromisso.id,
        chave: `zap:lembrete:${m}${compromisso.id}:${usuario.id}`,
        destino: telefone,
        assunto,
        corpo,
        modelo: modelo.nome,
        parametros: [
          limparParametro(nomeEscritorio),
          limparParametro(dados.titulo),
          limparParametro(quandoComMarco(quando.format(dados.inicio), marco)),
          limparParametro(
            dados.local ??
              (dados.numeroProcesso
                ? `Processo ${dados.numeroProcesso}`
                : null),
          ),
          limparParametro(telefoneDoEscritorio),
        ],
      });
      if (criadoZap) criados += 1;
    }

    // ----- quem vai ao compromisso e nao trabalha no escritorio -----
    //
    // Texto proprio: quem recebe precisa saber ONDE e QUANDO estar, nao como o
    // escritorio chamou aquilo internamente. E a chave leva o id do
    // participante, nao o do usuario: um compromisso tem varios, e cada um
    // recebe o seu.
    const { avisar } = await paraAvisarNoCompromisso(escritorioId, compromisso.id);
    for (const pessoa of avisar) {
      const assuntoDele = `${assuntoDoLembreteAoParticipante(nomeEscritorio, dados)} (${marco.rotulo})`;
      const corpoDele = corpoDoLembreteAoParticipante(
        nomeEscritorio,
        pessoa.nome,
        dados,
      );

      if (pessoa.email) {
        const criadoEmail = await criarAviso(escritorioId, {
          usuarioId: null,
          participanteId: pessoa.participanteId,
          canal: "EMAIL",
          tipo: "LEMBRETE_AO_PARTICIPANTE",
          compromissoId: compromisso.id,
          chave: `participante:${m}${compromisso.id}:${pessoa.participanteId}`,
          destino: pessoa.email,
          assunto: assuntoDele,
          corpo: corpoDele,
        });
        if (criadoEmail) criados += 1;
      }

      const modeloDele = modeloDoTipo("LEMBRETE_AO_PARTICIPANTE");
      if (!pessoa.telefone || !comWhatsapp || !modeloDele) continue;

      const criadoZapDele = await criarAviso(escritorioId, {
        usuarioId: null,
        participanteId: pessoa.participanteId,
        canal: "WHATSAPP",
        tipo: "LEMBRETE_AO_PARTICIPANTE",
        compromissoId: compromisso.id,
        chave: `zap:participante:${m}${compromisso.id}:${pessoa.participanteId}`,
        destino: pessoa.telefone,
        assunto: assuntoDele,
        corpo: corpoDele,
        modelo: modeloDele.nome,
        parametros: [
          limparParametro(pessoa.nome),
          limparParametro(nomeEscritorio),
          limparParametro(dados.titulo),
          limparParametro(quandoComMarco(quando.format(dados.inicio), marco)),
          limparParametro(
            dados.local ??
              (dados.numeroProcesso ? `Processo ${dados.numeroProcesso}` : null),
          ),
          limparParametro(telefoneDoEscritorio),
        ],
      });
      if (criadoZapDele) criados += 1;
    }
  }
  return criados;
}

/**
 * O resumo do dia, para quem recebe lembretes.
 *
 * DIA SEM NADA NAO GERA MENSAGEM — ver resumo-do-dia.ts. Esta e a regra que
 * mantem o resumo util: um e-mail que chega todo dia dizendo "nada para hoje"
 * ensina a pessoa a ignorar o resumo, e no dia do prazo vencendo ela nao le.
 *
 * Vai para todo mundo que quis receber, nao so para advogado: prazo sem
 * responsavel marcado nao pode virar problema de ninguem.
 */
export async function gerarResumoDoDia(
  escritorioId: string,
  agora = new Date(),
): Promise<number> {
  const escritorio = await prismaPlataforma().escritorio.findUniqueOrThrow({
    where: { id: escritorioId },
    select: { nome: true, slug: true, telefoneAtendimento: true },
  });
  const endereco = `https://${escritorio.slug}.${dominioDaPlataforma()}`;

  const fatos = await fatosDoDia(escritorioId, agora);
  const resumo = montarResumo(fatos, escritorio.nome);
  if (resumo.vazio) return 0;

  const corpo = corpoDoResumoDoDia(fatos, escritorio.nome, endereco);
  const dia = diaDaChave(agora);
  const comWhatsapp = await moduloAtivo(escritorioId, "WHATSAPP");
  const modelo = modeloDoTipo("RESUMO_DO_DIA");

  const usuarios = await comEscritorio(escritorioId, (db) =>
    db.usuario.findMany({ where: { ativo: true, recebeLembretes: true } }),
  );

  let criados = 0;
  for (const usuario of usuarios) {
    const criado = await criarAviso(escritorioId, {
      usuarioId: usuario.id,
      canal: "EMAIL",
      tipo: "RESUMO_DO_DIA",
      chave: `dia:${dia}:${usuario.id}`,
      destino: usuario.email,
      assunto: resumo.assunto,
      corpo,
    });
    if (criado) criados += 1;

    const telefone = telefoneDoUsuario(usuario, comWhatsapp);
    if (!telefone || !modelo) continue;

    const criadoZap = await criarAviso(escritorioId, {
      usuarioId: usuario.id,
      canal: "WHATSAPP",
      tipo: "RESUMO_DO_DIA",
      // Chave propria por canal: ligar o WhatsApp hoje nao reenvia o e-mail
      // de ontem.
      chave: `zap:dia:${dia}:${usuario.id}`,
      destino: telefone,
      assunto: resumo.assunto,
      // No WhatsApp vai a linha, nao o corpo: o corpo e HTML.
      corpo: resumo.linha,
      modelo: modelo.nome,
      parametros: [
        limparParametro(escritorio.nome),
        limparParametro(resumo.linha),
        limparParametro(escritorio.telefoneAtendimento?.trim() || "o escritorio"),
      ],
    });
    if (criadoZap) criados += 1;
  }

  return criados;
}

/**
 * Avisos de vencimento: contas a pagar e recebimentos previstos.
 *
 * SO PARA ADMIN. O financeiro do escritorio e fechado por papel e por senha de
 * administracao; mandar "conta a pagar de R$ 8.000 vence amanha" por e-mail
 * para todo mundo abriria por fora exatamente o que a tela fecha por dentro.
 *
 * Usa a mesma chave de "recebe lembretes" dos compromissos, de proposito: um
 * segundo interruptor so para dinheiro seria mais um lugar para alguem
 * esquecer de ligar.
 */
export async function gerarAvisosFinanceiros(
  escritorioId: string,
  agora = new Date(),
): Promise<number> {
  const [contas, administradores] = await Promise.all([
    contasParaAvisar(escritorioId, agora),
    comEscritorio(escritorioId, (db) =>
      db.usuario.findMany({
        where: { ativo: true, papel: "ADMIN", recebeLembretes: true },
        select: { id: true, email: true },
      }),
    ),
  ]);
  if (contas.length === 0 || administradores.length === 0) return 0;

  let criados = 0;
  for (const conta of contas) {
    for (const admin of administradores) {
      const criado = await criarAviso(escritorioId, {
        usuarioId: admin.id,
        canal: "EMAIL",
        tipo: conta.tipo,
        chave: `${conta.chave}:${admin.id}`,
        destino: admin.email,
        assunto: conta.titulo,
        corpo: conta.corpo,
      });
      if (criado) criados += 1;
    }
  }
  return criados;
}

type NovoAviso = {
  /** Nulo quando o aviso vai para alguem de fora: cliente, testemunha. */
  usuarioId: string | null;
  canal: "EMAIL" | "WHATSAPP";
  tipo: string;
  chave: string;
  destino: string;
  assunto: string;
  corpo: string;
  modelo?: string;
  parametros?: string[];
  /** O compromisso que gerou o aviso — e a prova de que a pessoa foi avisada. */
  compromissoId?: string;
  /** De quem e o contato: o reenvio usa o contato ATUAL do cadastro. */
  participanteId?: string;
};

/** Devolve false quando o aviso ja existia — e o que torna a rotina repetivel. */
async function criarAviso(
  escritorioId: string,
  aviso: NovoAviso,
): Promise<boolean> {
  return comEscritorio(escritorioId, async (db) => {
    const existente = await db.aviso.findFirst({
      where: { chave: aviso.chave },
      select: { id: true },
    });
    if (existente) return false;

    // Quem respondeu "parar" no WhatsApp nao recebe mais por WhatsApp — e a
    // conferencia e AQUI, na geracao, e nao na hora de enviar: um aviso
    // pendente que nunca sai ficaria para sempre na fila, somando tentativa.
    // O e-mail continua: o pedido foi sobre o WhatsApp.
    if (aviso.canal === "WHATSAPP") {
      const bloqueado = await db.bloqueioDeWhatsapp.findFirst({
        where: { telefone: aviso.destino },
        select: { id: true },
      });
      if (bloqueado) return false;
    }

    await db.aviso.create({
      data: semEscritorio({
        ...aviso,
        parametros: aviso.parametros ?? undefined,
      }),
    });
    return true;
  });
}

export type ResultadoDoEnvio = {
  enviados: number;
  falhas: number;
  semRemetente: boolean;
};

export async function enviarAvisosPendentes(
  escritorioId: string,
): Promise<ResultadoDoEnvio> {
  const pendentes = await comEscritorio(escritorioId, (db) =>
    db.aviso.findMany({
      where: {
        estado: "PENDENTE",
        canal: "EMAIL",
        tentativas: { lt: MAX_TENTATIVAS },
      },
      orderBy: { criadoEm: "asc" },
      take: 200,
    }),
  );
  if (pendentes.length === 0)
    return { enviados: 0, falhas: 0, semRemetente: false };

  const mensagens: Mensagem[] = pendentes.map((aviso) => ({
    para: aviso.destino,
    assunto: aviso.assunto,
    texto: aviso.corpo,
  }));

  let resultado: Awaited<ReturnType<typeof enviarLote>>;
  try {
    resultado = await enviarLote(escritorioId, mensagens);
  } catch (erro) {
    if (erro instanceof SemRemetente) {
      // Nao e falha do aviso: e configuracao que falta. Os avisos ficam
      // pendentes e saem no dia em que o escritorio conectar o e-mail.
      return { enviados: 0, falhas: 0, semRemetente: true };
    }
    throw erro;
  }

  const falhou = new Map(resultado.falhas.map((f) => [f.para, f.motivo]));
  const falharam: string[] = [];

  await comEscritorio(escritorioId, async (db) => {
    for (const aviso of pendentes) {
      const motivo = falhou.get(aviso.destino);
      if (!motivo) {
        await db.aviso.update({
          where: { id: aviso.id },
          data: { estado: "ENVIADO", enviadoEm: new Date(), erro: null },
        });
        continue;
      }
      const tentativas = aviso.tentativas + 1;
      const esgotou = tentativas >= MAX_TENTATIVAS;
      await db.aviso.update({
        where: { id: aviso.id },
        data: {
          tentativas,
          erro: motivo.slice(0, 500),
          // Esgotadas as tentativas, para de tentar — mas a linha fica, para
          // o escritorio ver que aquele aviso nunca chegou.
          estado: esgotou ? "FALHOU" : "PENDENTE",
          falhouEm: esgotou ? new Date() : null,
        },
      });
      if (esgotou) falharam.push(aviso.id);
    }
  });
  // Fora da transacao: o alerta abre a sua.
  for (const id of falharam) await depoisDaFalha(escritorioId, id);

  if (resultado.enviadas > 0) {
    await registrarConsumo(escritorioId, "EMAIL_ENVIADO", resultado.enviadas);
  }

  return {
    enviados: resultado.enviadas,
    falhas: resultado.falhas.length,
    semRemetente: false,
  };
}

export type ResultadoDoEnvioNoWhatsapp = {
  enviados: number;
  falhas: number;
  semNumero: boolean;
};

/**
 * Entrega os avisos pendentes do canal WhatsApp.
 *
 * Um por vez, de proposito: a Cloud API e uma mensagem por chamada, e o que
 * importa aqui e que a falha de um numero nao contamine os outros. Erro que a
 * Meta ja disse ser definitivo (modelo que nao existe, numero que nao tem
 * WhatsApp) para na hora em FALHOU — insistir tres vezes no mesmo "nao" so
 * atrasa os que dariam certo e gasta a nota de qualidade do numero.
 */
export async function enviarAvisosNoWhatsapp(
  escritorioId: string,
): Promise<ResultadoDoEnvioNoWhatsapp> {
  const pendentes = await comEscritorio(escritorioId, (db) =>
    db.aviso.findMany({
      where: {
        estado: "PENDENTE",
        canal: "WHATSAPP",
        tentativas: { lt: MAX_TENTATIVAS },
      },
      orderBy: { criadoEm: "asc" },
      take: 200,
    }),
  );
  if (pendentes.length === 0)
    return { enviados: 0, falhas: 0, semNumero: false };

  let enviados = 0;
  let falhas = 0;

  for (const aviso of pendentes) {
    const parametros = Array.isArray(aviso.parametros)
      ? (aviso.parametros as unknown[]).map((p) => String(p))
      : [];

    if (!aviso.modelo || parametros.length === 0) {
      // Aviso de WhatsApp sem modelo nao tem como sair: marca e segue.
      await marcarFalha(
        escritorioId,
        aviso.id,
        MAX_TENTATIVAS,
        "Aviso sem modelo aprovado.",
      );
      falhas += 1;
      continue;
    }

    try {
      const { idNaMeta } = await enviarModelo({
        para: aviso.destino,
        modelo: aviso.modelo,
        parametros,
      });
      // O id da Meta e o que liga o retorno de entrega (entregue, lida,
      // falhou) a este aviso — ver entrega-do-escritorio.ts.
      await marcarEnviado(escritorioId, aviso.id, idNaMeta);
      enviados += 1;
    } catch (erro) {
      if (erro instanceof SemNumeroDeWhatsapp) {
        // Configuracao que falta, nao falha do aviso: os pendentes ficam de pe
        // e saem no dia em que a PLATAFORMA configurar o numero. Nao e algo
        // que o escritorio resolva — o numero e um so, e e nosso.
        return { enviados, falhas, semNumero: true };
      }
      if (!(erro instanceof FalhaNoWhatsapp)) throw erro;

      const tentativas = erro.definitivo
        ? MAX_TENTATIVAS
        : aviso.tentativas + 1;
      await marcarFalha(escritorioId, aviso.id, tentativas, erro.message, erro.codigo);
      falhas += 1;
    }
  }

  if (enviados > 0)
    await registrarConsumo(escritorioId, "WHATSAPP_MSG", enviados);
  return { enviados, falhas, semNumero: false };
}

/**
 * ENVIADO, com o id da Meta. O id nunca pode impedir a marcacao: a mensagem
 * JA saiu, e um aviso que ficasse PENDENTE sairia de novo na proxima rodada.
 * Id repetido (nao deveria acontecer) fica de fora, e so o retorno de
 * entrega daquele aviso se perde.
 */
async function marcarEnviado(escritorioId: string, id: string, idNaMeta: string): Promise<void> {
  const base = { estado: "ENVIADO", enviadoEm: new Date(), erro: null, erroCodigo: null };
  try {
    await comEscritorio(escritorioId, (db) => db.aviso.update({ where: { id }, data: { ...base, idNaMeta } }));
  } catch (erro) {
    if ((erro as { code?: string }).code !== "P2002") throw erro;
    console.error(`aviso ${id}: id da Meta repetido (${idNaMeta}); gravado sem ele.`);
    await comEscritorio(escritorioId, (db) => db.aviso.update({ where: { id }, data: base }));
  }
}

async function marcarFalha(
  escritorioId: string,
  id: string,
  tentativas: number,
  motivo: string,
  codigo: number | null = null,
): Promise<void> {
  const falhou = tentativas >= MAX_TENTATIVAS;
  await comEscritorio(escritorioId, (db) =>
    db.aviso.update({
      where: { id },
      data: {
        tentativas,
        erro: motivo.slice(0, 500),
        erroCodigo: codigo,
        estado: falhou ? "FALHOU" : "PENDENTE",
        falhouEm: falhou ? new Date() : null,
      },
    }),
  );
  // Falhou de vez: reenvio automatico ou alerta para a equipe.
  if (falhou) await depoisDaFalha(escritorioId, id);
}

// ---------------------------------------------------------------------------
// Avisos que saem NA HORA, e nao pela regua
// ---------------------------------------------------------------------------
//
// A regua avisa do que vai acontecer. Estes dois avisam do que ACABOU de
// acontecer: uma tarefa ficou com alguem, um compromisso foi marcado. Quem
// precisa saber precisa saber agora — nao na proxima rodada da fila.
//
// Sao gravados como qualquer outro aviso, com chave de idempotencia, e saem
// pelo mesmo caminho. Quem chama enfileira um LEMBRAR logo em seguida, e o
// trabalhador entrega em segundos.

/** Dados do compromisso como os textos e os modelos esperam. */
async function paraOTexto(escritorioId: string, compromissoId: string) {
  const c = await comEscritorio(escritorioId, (db) =>
    db.compromisso.findFirst({
      where: { id: compromissoId },
      include: {
        processo: { select: { numero: true } },
        cliente: { select: { nome: true } },
      },
    }),
  );
  if (!c) return null;
  return {
    compromisso: c,
    dados: {
      titulo: c.titulo,
      tipo: c.tipo,
      inicio: c.inicio,
      local: c.local,
      numeroProcesso: c.processo?.numero ?? null,
    },
  };
}

async function daBanca(escritorioId: string) {
  const e = await prismaPlataforma().escritorio.findUniqueOrThrow({
    where: { id: escritorioId },
    select: { nome: true, slug: true, telefoneAtendimento: true },
  });
  return {
    nome: e.nome,
    telefone: e.telefoneAtendimento?.trim() || "o escritorio",
    endereco: `https://${e.slug}.${dominioDaPlataforma()}`,
  };
}

/**
 * Avisa quem ficou com a tarefa.
 *
 * So a pessoa designada. Mandar para o escritorio inteiro faria cada um achar
 * que e do outro — que e exatamente o problema que ter responsavel resolve.
 */
export async function avisarDesignacao(
  escritorioId: string,
  compromissoId: string,
  designadoPor: string | null = null,
): Promise<number> {
  const achado = await paraOTexto(escritorioId, compromissoId);
  if (!achado?.compromisso.responsavelId) return 0;

  const responsavel = await comEscritorio(escritorioId, (db) =>
    db.usuario.findFirst({
      where: { id: achado.compromisso.responsavelId!, ativo: true },
      select: { id: true, nome: true, email: true, telefone: true, recebeWhatsapp: true },
    }),
  );
  if (!responsavel) return 0;

  // Quem designou para si mesmo nao precisa de aviso: acabou de digitar.
  if (designadoPor && designadoPor === responsavel.id) return 0;

  const quemDesignou = designadoPor
    ? ((
        await comEscritorio(escritorioId, (db) =>
          db.usuario.findFirst({ where: { id: designadoPor }, select: { nome: true } }),
        )
      )?.nome ?? null)
    : null;

  const banca = await daBanca(escritorioId);
  const comWhatsapp = await moduloAtivo(escritorioId, "WHATSAPP");
  const { dados } = achado;
  // A chave leva o responsavel: redesignar para outra pessoa avisa a nova, e
  // devolver para a primeira nao a avisa de novo.
  const chave = `designado:${compromissoId}:${responsavel.id}`;
  let criados = 0;

  if (
    await criarAviso(escritorioId, {
      usuarioId: responsavel.id,
      canal: "EMAIL",
      tipo: "TAREFA_DESIGNADA",
      compromissoId,
      chave,
      destino: responsavel.email,
      assunto: assuntoDaDesignacao(dados),
      corpo: corpoDaDesignacao(banca.nome, quemDesignou, dados, banca.endereco),
    })
  ) {
    criados += 1;
  }

  const modelo = modeloDoTipo("TAREFA_DESIGNADA");
  const telefone = telefoneDoUsuario(responsavel, comWhatsapp);
  if (telefone && modelo) {
    const criadoZap = await criarAviso(escritorioId, {
      usuarioId: responsavel.id,
      canal: "WHATSAPP",
      tipo: "TAREFA_DESIGNADA",
      compromissoId,
      chave: `zap:${chave}`,
      destino: telefone,
      assunto: assuntoDaDesignacao(dados),
      corpo: corpoDaDesignacao(banca.nome, quemDesignou, dados, banca.endereco),
      modelo: modelo.nome,
      parametros: [
        limparParametro(banca.nome),
        limparParametro(dados.titulo),
        limparParametro(dataHoraBR.format(dados.inicio)),
        limparParametro(
          achado.compromisso.cliente?.nome ??
            (dados.numeroProcesso ? `Processo ${dados.numeroProcesso}` : null),
        ),
        limparParametro(banca.telefone),
      ],
    });
    if (criadoZap) criados += 1;
  }

  return criados;
}

/**
 * Avisa quem vai comparecer de que o compromisso foi marcado.
 *
 * E a PRIMEIRA noticia, nao o lembrete — por isso sai na hora de marcar, e
 * nao tres dias antes. Quem e marcado para uma audiencia daqui a dois meses
 * precisa saber hoje, nao daqui a oito semanas.
 */
export async function avisarAgendamento(
  escritorioId: string,
  compromissoId: string,
): Promise<number> {
  const achado = await paraOTexto(escritorioId, compromissoId);
  if (!achado) return 0;
  // So encontro: tarefa e prazo sao trabalho do escritorio, e quem esta de
  // fora nao tem o que fazer com esse aviso.
  if (!TIPOS_COM_REGUA.has(achado.compromisso.tipo)) return 0;

  const banca = await daBanca(escritorioId);
  const comWhatsapp = await moduloAtivo(escritorioId, "WHATSAPP");
  const modelo = modeloDoTipo("COMPROMISSO_MARCADO");
  const { dados } = achado;

  const { avisar } = await paraAvisarNoCompromisso(escritorioId, compromissoId);
  let criados = 0;

  for (const pessoa of avisar) {
    const chave = `marcado:${compromissoId}:${pessoa.participanteId}`;
    const assunto = assuntoDoAgendamento(banca.nome, dados);
    const corpo = corpoDoAgendamento(banca.nome, pessoa.nome, dados);

    if (pessoa.email) {
      if (
        await criarAviso(escritorioId, {
          usuarioId: null,
          participanteId: pessoa.participanteId,
          canal: "EMAIL",
          tipo: "COMPROMISSO_MARCADO",
          compromissoId,
          chave,
          destino: pessoa.email,
          assunto,
          corpo,
        })
      ) {
        criados += 1;
      }
    }

    if (!pessoa.telefone || !comWhatsapp || !modelo) continue;
    const criadoZap = await criarAviso(escritorioId, {
      usuarioId: null,
      participanteId: pessoa.participanteId,
      canal: "WHATSAPP",
      tipo: "COMPROMISSO_MARCADO",
      compromissoId,
      chave: `zap:${chave}`,
      destino: pessoa.telefone,
      assunto,
      corpo,
      modelo: modelo.nome,
      parametros: [
        limparParametro(pessoa.nome),
        limparParametro(banca.nome),
        limparParametro(dados.titulo),
        limparParametro(dataHoraBR.format(dados.inicio)),
        limparParametro(
          dados.local ??
            (dados.numeroProcesso ? `Processo ${dados.numeroProcesso}` : null),
        ),
        limparParametro(banca.telefone),
      ],
    });
    if (criadoZap) criados += 1;
  }

  return criados;
}

export { AVISOS_MANUAIS, ROTULO_DO_AVISO_MANUAL, type AvisoManual } from "./avisos-manuais";

export type ResultadoDoAvisoManual = {
  /** Quantos avisos foram gravados para sair. */
  criados: number;
  /** Quem nao tem telefone nem e-mail. */
  semContato: string[];
  /** Quem so tem telefone, num escritorio sem WhatsApp. */
  soPorWhatsappDesligado: string[];
};

/**
 * Manda AGORA, a pedido de alguem do escritorio, o aviso que a regua mandaria
 * sozinha — a confirmacao ou um dos lembretes — para todos os participantes.
 *
 * A chave leva a hora do pedido: cada clique e um envio novo, de proposito.
 * Quem clica em "Avisar" quer que a pessoa receba de novo, nao que o sistema
 * responda "ja foi". E cada envio fica na auditoria como mais um aviso.
 *
 * Grava e deixa para o trabalhador entregar (LEMBRAR na fila), como os
 * outros: a tela nao espera a Meta nem o SMTP.
 */
export async function avisarAgora(
  escritorioId: string,
  compromissoId: string,
  qual: Manual,
): Promise<ResultadoDoAvisoManual> {
  const achado = await paraOTexto(escritorioId, compromissoId);
  if (!achado) throw new CompromissoNaoEncontrado();

  const banca = await daBanca(escritorioId);
  const comWhatsapp = await moduloAtivo(escritorioId, "WHATSAPP");
  const { dados } = achado;
  const { avisar, semContato, soPorWhatsappDesligado } =
    await paraAvisarNoCompromisso(escritorioId, compromissoId);

  const marco = MARCOS.find((m) => m.chave === (qual === "LEMBRETE_1H" ? "1h" : "24h"))!;
  const carimbo = Date.now();
  let criados = 0;

  for (const pessoa of avisar) {
    const base = `manual:${qual}:${carimbo}:${compromissoId}:${pessoa.participanteId}`;
    const texto =
      qual === "AGENDADO"
        ? {
            tipo: "COMPROMISSO_MARCADO",
            assunto: assuntoDoAgendamento(banca.nome, dados),
            corpo: corpoDoAgendamento(banca.nome, pessoa.nome, dados),
            modelo: modeloDoTipo("COMPROMISSO_MARCADO"),
            parametros: [
              limparParametro(pessoa.nome),
              limparParametro(banca.nome),
              limparParametro(dados.titulo),
              limparParametro(dataHoraBR.format(dados.inicio)),
              limparParametro(
                dados.local ??
                  (dados.numeroProcesso ? `Processo ${dados.numeroProcesso}` : null),
              ),
              limparParametro(banca.telefone),
            ],
          }
        : {
            tipo: "LEMBRETE_AO_PARTICIPANTE",
            assunto: `${assuntoDoLembreteAoParticipante(banca.nome, dados)} (${marco.rotulo})`,
            corpo: corpoDoLembreteAoParticipante(banca.nome, pessoa.nome, dados),
            modelo: modeloDoTipo("LEMBRETE_AO_PARTICIPANTE"),
            parametros: [
              limparParametro(pessoa.nome),
              limparParametro(banca.nome),
              limparParametro(dados.titulo),
              limparParametro(quandoComMarco(dataHoraBR.format(dados.inicio), marco)),
              limparParametro(
                dados.local ??
                  (dados.numeroProcesso ? `Processo ${dados.numeroProcesso}` : null),
              ),
              limparParametro(banca.telefone),
            ],
          };

    if (pessoa.email) {
      if (
        await criarAviso(escritorioId, {
          usuarioId: null,
          participanteId: pessoa.participanteId,
          canal: "EMAIL",
          tipo: texto.tipo,
          compromissoId,
          chave: base,
          destino: pessoa.email,
          assunto: texto.assunto,
          corpo: texto.corpo,
        })
      ) {
        criados += 1;
      }
    }

    if (!pessoa.telefone || !comWhatsapp || !texto.modelo) continue;
    if (
      await criarAviso(escritorioId, {
        usuarioId: null,
        participanteId: pessoa.participanteId,
        canal: "WHATSAPP",
        tipo: texto.tipo,
        compromissoId,
        chave: `zap:${base}`,
        destino: pessoa.telefone,
        assunto: texto.assunto,
        corpo: texto.corpo,
        modelo: texto.modelo.nome,
        parametros: texto.parametros,
      })
    ) {
      criados += 1;
    }
  }

  return { criados, semContato, soPorWhatsappDesligado };
}
