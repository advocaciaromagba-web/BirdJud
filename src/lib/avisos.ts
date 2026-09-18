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
import {
  assuntoDoLembrete,
  assuntoDoResumo,
  corpoDoLembrete,
  corpoDoResumo,
} from "./textos-aviso";

const HORA = 60 * 60 * 1000;

/** Antecedencia do lembrete de compromisso. */
export const ANTECEDENCIA_HORAS = 24;

/** Tentativas de envio antes de o aviso parar em FALHOU. */
export const MAX_TENTATIVAS = 3;

export type ResultadoDaGeracao = {
  resumos: number;
  lembretes: number;
};

/** Dia em que o aviso foi gerado, para compor a chave: "2026-09-18". */
export function diaDaChave(data: Date): string {
  return data.toISOString().slice(0, 10);
}

export async function gerarAvisos(
  escritorioId: string,
  agora = new Date()
): Promise<ResultadoDaGeracao> {
  const escritorio = await prismaPlataforma().escritorio.findUniqueOrThrow({
    where: { id: escritorioId },
    select: { nome: true, slug: true },
  });
  const dominio = process.env.DOMINIO_PLATAFORMA ?? "birdjud.com.br";
  const endereco = `https://${escritorio.slug}.${dominio}`;

  const resumos = await gerarResumos(escritorioId, escritorio.nome, endereco, agora);
  const lembretes = await gerarLembretes(escritorioId, escritorio.nome, endereco, agora);

  return { resumos, lembretes };
}

async function gerarResumos(
  escritorioId: string,
  nomeEscritorio: string,
  endereco: string,
  agora: Date
): Promise<number> {
  const dia = diaDaChave(agora);

  const { publicacoes, usuarios } = await comEscritorio(escritorioId, async (db) => ({
    publicacoes: await db.publicacao.findMany({
      where: { lida: false, arquivada: false },
      orderBy: [{ urgente: "desc" }, { dataDisponibilizacao: "desc" }],
      take: 50,
    }),
    usuarios: await db.usuario.findMany({ where: { ativo: true, recebeResumo: true } }),
  }));

  // Sem publicacao nao lida, nao ha resumo. E-mail vazio todo dia treina a
  // equipe a ignorar o remetente — justamente o que nao se pode perder.
  if (publicacoes.length === 0 || usuarios.length === 0) return 0;

  const urgentes = publicacoes.filter((p) => p.urgente).length;
  const assunto = assuntoDoResumo(publicacoes.length, urgentes);
  const corpo = corpoDoResumo(nomeEscritorio, publicacoes, endereco);

  let criados = 0;
  for (const usuario of usuarios) {
    const criado = await criarAviso(escritorioId, {
      usuarioId: usuario.id,
      tipo: "RESUMO_PUBLICACOES",
      chave: `resumo:${dia}:${usuario.id}`,
      destino: usuario.email,
      assunto,
      corpo,
    });
    if (criado) criados += 1;
  }
  return criados;
}

async function gerarLembretes(
  escritorioId: string,
  nomeEscritorio: string,
  endereco: string,
  agora: Date
): Promise<number> {
  const limite = new Date(agora.getTime() + ANTECEDENCIA_HORAS * HORA);

  const { compromissos, usuarios } = await comEscritorio(escritorioId, async (db) => ({
    compromissos: await db.compromisso.findMany({
      where: { concluido: false, inicio: { gte: agora, lte: limite } },
      include: { processo: { select: { numero: true } } },
      orderBy: { inicio: "asc" },
      take: 100,
    }),
    usuarios: await db.usuario.findMany({ where: { ativo: true, recebeLembretes: true } }),
  }));

  if (compromissos.length === 0 || usuarios.length === 0) return 0;

  let criados = 0;
  for (const compromisso of compromissos) {
    const dados = {
      titulo: compromisso.titulo,
      tipo: compromisso.tipo,
      inicio: compromisso.inicio,
      local: compromisso.local,
      numeroProcesso: compromisso.processo?.numero ?? null,
    };
    const assunto = assuntoDoLembrete(dados);
    const corpo = corpoDoLembrete(nomeEscritorio, dados, endereco);

    for (const usuario of usuarios) {
      const criado = await criarAviso(escritorioId, {
        usuarioId: usuario.id,
        tipo: "LEMBRETE_COMPROMISSO",
        // Um lembrete por compromisso e por pessoa, para sempre.
        chave: `lembrete:${compromisso.id}:${usuario.id}`,
        destino: usuario.email,
        assunto,
        corpo,
      });
      if (criado) criados += 1;
    }
  }
  return criados;
}

type NovoAviso = {
  usuarioId: string;
  tipo: string;
  chave: string;
  destino: string;
  assunto: string;
  corpo: string;
};

/** Devolve false quando o aviso ja existia — e o que torna a rotina repetivel. */
async function criarAviso(escritorioId: string, aviso: NovoAviso): Promise<boolean> {
  return comEscritorio(escritorioId, async (db) => {
    const existente = await db.aviso.findFirst({
      where: { chave: aviso.chave },
      select: { id: true },
    });
    if (existente) return false;

    await db.aviso.create({ data: semEscritorio({ ...aviso, canal: "EMAIL" }) });
    return true;
  });
}

export type ResultadoDoEnvio = {
  enviados: number;
  falhas: number;
  semRemetente: boolean;
};

export async function enviarAvisosPendentes(
  escritorioId: string
): Promise<ResultadoDoEnvio> {
  const pendentes = await comEscritorio(escritorioId, (db) =>
    db.aviso.findMany({
      where: { estado: "PENDENTE", canal: "EMAIL", tentativas: { lt: MAX_TENTATIVAS } },
      orderBy: { criadoEm: "asc" },
      take: 200,
    })
  );
  if (pendentes.length === 0) return { enviados: 0, falhas: 0, semRemetente: false };

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
      await db.aviso.update({
        where: { id: aviso.id },
        data: {
          tentativas,
          erro: motivo.slice(0, 500),
          // Esgotadas as tentativas, para de tentar — mas a linha fica, para
          // o escritorio ver que aquele aviso nunca chegou.
          estado: tentativas >= MAX_TENTATIVAS ? "FALHOU" : "PENDENTE",
        },
      });
    }
  });

  if (resultado.enviadas > 0) {
    await registrarConsumo(escritorioId, "EMAIL_ENVIADO", resultado.enviadas);
  }

  return { enviados: resultado.enviadas, falhas: resultado.falhas.length, semRemetente: false };
}
