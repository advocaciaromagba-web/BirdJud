// O que o sistema faz com a mensagem que CHEGA pelo WhatsApp.
//
// A regra de leitura mora em resposta-whatsapp.ts, pura e testada. Aqui se
// descobre de quem e a mensagem, grava-se o que chegou, mexe-se no
// compromisso e responde-se.
//
// A ORDEM DOS PASSOS E A PROTECAO: a linha e gravada ANTES de qualquer acao e
// antes da resposta. A Meta reentrega o mesmo evento quando o nosso 200
// demora, e duas entregas simultaneas sao normais. Gravar primeiro faz do
// indice unico de `idNaMeta` a porteira: quem perde a corrida descobre na
// hora, e o cliente nao recebe a resposta automatica duas vezes.
import { comEscritorio, prismaPlataforma, semEscritorio } from "./prisma";
import { dataHoraBR } from "./datas";
import {
  JANELA_DE_RESPOSTA_HORAS,
  aQualLembreteResponde,
  interpretar,
  origemDaChave,
  textoDaResposta,
  type Intencao,
} from "./resposta-whatsapp";
import { FalhaNoWhatsapp, paraE164BR, responderTexto } from "./whatsapp";

/** Uma mensagem como ela chega do webhook, ja limpa. */
export type MensagemRecebida = {
  idNaMeta: string;
  de: string;
  texto: string;
};

export type Desfecho =
  | "REPETIDA"
  | "SEM_LEMBRETE"
  | "DOIS_ESCRITORIOS"
  | "TRATADA";

export type ResultadoDaEntrada = {
  desfecho: Desfecho;
  intencao: Intencao;
  escritorioId: string | null;
  respondeu: boolean;
};

const HORA = 60 * 60 * 1000;

/**
 * Trata uma mensagem recebida.
 *
 * Nunca lanca por causa da Meta: webhook que devolve erro e webhook que a Meta
 * repete, e repetir nao conserta telefone desconhecido nem token vencido. O
 * que da errado fica gravado na propria linha.
 */
export async function tratarMensagem(
  m: MensagemRecebida,
  agora = new Date(),
): Promise<ResultadoDaEntrada> {
  const telefone = paraE164BR(m.de) ?? m.de.replace(/\D/g, "");
  const intencao = interpretar(m.texto);

  // ----- de quem e esta mensagem -----
  //
  // Pelo LEMBRETE QUE ELA RESPONDE, e nao pelo numero que recebeu: resposta e
  // resposta de alguma coisa. Isso vale igual se um dia o WhatsApp for um
  // numero unico da plataforma ou um numero por escritorio.
  const desde = new Date(agora.getTime() - JANELA_DE_RESPOSTA_HORAS * HORA);
  const candidatos = await prismaPlataforma().aviso.findMany({
    where: {
      canal: "WHATSAPP",
      destino: telefone,
      estado: "ENVIADO",
      enviadoEm: { gte: desde },
      tipo: { in: ["LEMBRETE_COMPROMISSO", "LEMBRETE_AO_PARTICIPANTE"] },
    },
    select: { id: true, escritorioId: true, chave: true, enviadoEm: true },
    orderBy: { enviadoEm: "desc" },
    take: 20,
  });

  const achado = aQualLembreteResponde(candidatos);
  const escritorioId = achado.tipo === "UM" ? achado.aviso.escritorioId : null;
  const origem = achado.tipo === "UM" ? origemDaChave(achado.aviso.chave) : null;
  const semDono =
    achado.tipo === "AMBIGUO"
      ? "DOIS_ESCRITORIOS"
      : achado.tipo === "NENHUM"
        ? "SEM_LEMBRETE"
        : null;

  // ----- a porteira -----
  let registro: { id: string };
  try {
    registro = await prismaPlataforma().respostaDeWhatsapp.create({
      data: {
        escritorioId,
        idNaMeta: m.idNaMeta,
        telefone,
        texto: m.texto.slice(0, 2000),
        intencao,
        avisoId: achado.tipo === "UM" ? achado.aviso.id : null,
        compromissoId: origem?.compromissoId ?? null,
        participanteId: origem?.participanteId ?? null,
        semDono,
      },
      select: { id: true },
    });
  } catch {
    // Unico motivo possivel: idNaMeta repetido, ou seja, ja tratada.
    return { desfecho: "REPETIDA", intencao, escritorioId, respondeu: false };
  }

  if (!escritorioId) {
    // Sem dono nao ha a quem responder: a credencial de WhatsApp e de um
    // escritorio, e escolher um dos dois no palpite mandaria a resposta de uma
    // banca para o cliente de outra.
    return {
      desfecho: semDono === "DOIS_ESCRITORIOS" ? "DOIS_ESCRITORIOS" : "SEM_LEMBRETE",
      intencao,
      escritorioId: null,
      respondeu: false,
    };
  }

  const compromisso = origem?.compromissoId
    ? await comEscritorio(escritorioId, (db) =>
        db.compromisso.findFirst({
          where: { id: origem.compromissoId },
          select: { titulo: true, inicio: true },
        }),
      )
    : null;

  await aplicar(escritorioId, intencao, telefone, origem);

  const escritorio = await prismaPlataforma().escritorio.findFirst({
    where: { id: escritorioId },
    select: { nome: true },
  });

  const respondeu = await responder(escritorioId, telefone, intencao, {
    nomeEscritorio: escritorio?.nome ?? "O escritorio",
    titulo: compromisso?.titulo ?? null,
    quando: compromisso ? dataHoraBR.format(compromisso.inicio) : null,
  });

  if (respondeu) {
    await prismaPlataforma().respostaDeWhatsapp.update({
      where: { id: registro.id },
      data: { respondidoEm: new Date() },
    });
  }

  return { desfecho: "TRATADA", intencao, escritorioId, respondeu };
}

/** Mexe no que a resposta mudou: a presenca, ou a vontade de receber. */
async function aplicar(
  escritorioId: string,
  intencao: Intencao,
  telefone: string,
  origem: { participanteId: string | null; usuarioId: string | null } | null,
): Promise<void> {
  if (intencao === "PARAR") {
    // Nao basta desligar o aviso do compromisso de hoje: a audiencia do mes
    // que vem geraria outro lembrete, e o pedido teria durado tres semanas.
    await comEscritorio(escritorioId, (db) =>
      db.bloqueioDeWhatsapp.upsert({
        where: { escritorioId_telefone: { escritorioId, telefone } },
        create: semEscritorio({ telefone, motivo: "PEDIDO_DA_PESSOA" }),
        update: {},
      }),
    );
    if (origem?.usuarioId) {
      await comEscritorio(escritorioId, (db) =>
        db.usuario.updateMany({
          where: { id: origem.usuarioId! },
          data: { recebeWhatsapp: false },
        }),
      );
    }
    return;
  }

  if (!origem?.participanteId) return;
  if (intencao !== "CONFIRMA" && intencao !== "DESMARCA") return;

  // Os dois campos sao mexidos juntos: quem confirmou depois de ter recusado
  // precisa perder a recusa, senao a tela mostraria as duas coisas.
  await comEscritorio(escritorioId, (db) =>
    db.participanteDeCompromisso.updateMany({
      where: { id: origem.participanteId! },
      data:
        intencao === "CONFIRMA"
          ? { confirmadoEm: new Date(), recusadoEm: null }
          : { recusadoEm: new Date(), confirmadoEm: null },
    }),
  );
}

async function responder(
  escritorioId: string,
  telefone: string,
  intencao: Intencao,
  dados: { nomeEscritorio: string; titulo: string | null; quando: string | null },
): Promise<boolean> {
  try {
    await responderTexto(escritorioId, telefone, textoDaResposta(intencao, dados));
    return true;
  } catch (erro) {
    // Nao responder e ruim; devolver erro para a Meta e pior, porque ela
    // reentrega e o resto do tratamento aconteceria de novo.
    console.log(
      `whatsapp entrada: resposta nao saiu ${JSON.stringify({
        escritorioId,
        motivo: erro instanceof FalhaNoWhatsapp ? erro.message : "falha",
      })}`.slice(0, 500),
    );
    return false;
  }
}

/** Telefones que pediram para nao receber mais deste escritorio. */
export async function bloqueadosNoWhatsapp(
  escritorioId: string,
): Promise<Set<string>> {
  const linhas = await comEscritorio(escritorioId, (db) =>
    db.bloqueioDeWhatsapp.findMany({ select: { telefone: true } }),
  );
  return new Set(linhas.map((l) => l.telefone));
}

export type RespostaNaTela = {
  id: string;
  telefone: string;
  texto: string;
  intencao: string;
  compromissoId: string | null;
  criadoEm: Date;
  lidaEm: Date | null;
};

/** O que chegou e o sistema NAO entendeu — a caixa de entrada do escritorio. */
export async function respostasParaLer(
  escritorioId: string,
  limite = 20,
): Promise<RespostaNaTela[]> {
  return comEscritorio(escritorioId, (db) =>
    db.respostaDeWhatsapp.findMany({
      where: { intencao: "NAO_ENTENDI", lidaEm: null },
      orderBy: { criadoEm: "desc" },
      take: limite,
      select: {
        id: true,
        telefone: true,
        texto: true,
        intencao: true,
        compromissoId: true,
        criadoEm: true,
        lidaEm: true,
      },
    }),
  );
}

export async function marcarComoLida(
  escritorioId: string,
  id: string,
): Promise<void> {
  await comEscritorio(escritorioId, (db) =>
    db.respostaDeWhatsapp.updateMany({
      where: { id },
      data: { lidaEm: new Date() },
    }),
  );
}
