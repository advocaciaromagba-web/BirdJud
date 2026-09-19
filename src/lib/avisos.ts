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
import { enviarModelo, FalhaNoWhatsapp, paraE164BR, SemNumeroDeWhatsapp } from "./whatsapp";
import { limparParametro, modeloDoTipo } from "./modelos-whatsapp";
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

/** Quem recebe por WhatsApp: quis receber, tem telefone legivel, e o modulo esta contratado. */
function telefoneDoUsuario(
  usuario: { recebeWhatsapp: boolean; telefone: string | null },
  moduloLigado: boolean
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
  agora = new Date()
): Promise<ResultadoDaGeracao> {
  const escritorio = await prismaPlataforma().escritorio.findUniqueOrThrow({
    where: { id: escritorioId },
    select: { nome: true, slug: true },
  });
  const dominio = process.env.DOMINIO_PLATAFORMA ?? "birdjud.com.br";
  const endereco = `https://${escritorio.slug}.${dominio}`;

  const comWhatsapp = await moduloAtivo(escritorioId, "WHATSAPP");

  const resumos = await gerarResumos(escritorioId, escritorio.nome, endereco, agora, comWhatsapp);
  const lembretes = await gerarLembretes(
    escritorioId,
    escritorio.nome,
    endereco,
    agora,
    comWhatsapp
  );

  return { resumos, lembretes };
}

async function gerarResumos(
  escritorioId: string,
  nomeEscritorio: string,
  endereco: string,
  agora: Date,
  comWhatsapp: boolean
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
  endereco: string,
  agora: Date,
  comWhatsapp: boolean
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

  const modelo = modeloDoTipo("LEMBRETE_COMPROMISSO");
  const quando = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });

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
        canal: "EMAIL",
        tipo: "LEMBRETE_COMPROMISSO",
        // Um lembrete por compromisso e por pessoa, para sempre.
        chave: `lembrete:${compromisso.id}:${usuario.id}`,
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
        chave: `zap:lembrete:${compromisso.id}:${usuario.id}`,
        destino: telefone,
        assunto,
        corpo,
        modelo: modelo.nome,
        parametros: [
          limparParametro(nomeEscritorio),
          limparParametro(dados.titulo),
          limparParametro(quando.format(dados.inicio)),
          limparParametro(
            dados.local ??
              (dados.numeroProcesso ? `Processo ${dados.numeroProcesso}` : null)
          ),
        ],
      });
      if (criadoZap) criados += 1;
    }
  }
  return criados;
}

type NovoAviso = {
  usuarioId: string;
  canal: "EMAIL" | "WHATSAPP";
  tipo: string;
  chave: string;
  destino: string;
  assunto: string;
  corpo: string;
  modelo?: string;
  parametros?: string[];
};

/** Devolve false quando o aviso ja existia — e o que torna a rotina repetivel. */
async function criarAviso(escritorioId: string, aviso: NovoAviso): Promise<boolean> {
  return comEscritorio(escritorioId, async (db) => {
    const existente = await db.aviso.findFirst({
      where: { chave: aviso.chave },
      select: { id: true },
    });
    if (existente) return false;

    await db.aviso.create({
      data: semEscritorio({ ...aviso, parametros: aviso.parametros ?? undefined }),
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
  escritorioId: string
): Promise<ResultadoDoEnvioNoWhatsapp> {
  const pendentes = await comEscritorio(escritorioId, (db) =>
    db.aviso.findMany({
      where: { estado: "PENDENTE", canal: "WHATSAPP", tentativas: { lt: MAX_TENTATIVAS } },
      orderBy: { criadoEm: "asc" },
      take: 200,
    })
  );
  if (pendentes.length === 0) return { enviados: 0, falhas: 0, semNumero: false };

  let enviados = 0;
  let falhas = 0;

  for (const aviso of pendentes) {
    const parametros = Array.isArray(aviso.parametros)
      ? (aviso.parametros as unknown[]).map((p) => String(p))
      : [];

    if (!aviso.modelo || parametros.length === 0) {
      // Aviso de WhatsApp sem modelo nao tem como sair: marca e segue.
      await marcarFalha(escritorioId, aviso.id, MAX_TENTATIVAS, "Aviso sem modelo aprovado.");
      falhas += 1;
      continue;
    }

    try {
      await enviarModelo(escritorioId, {
        para: aviso.destino,
        modelo: aviso.modelo,
        parametros,
      });
      await comEscritorio(escritorioId, (db) =>
        db.aviso.update({
          where: { id: aviso.id },
          data: { estado: "ENVIADO", enviadoEm: new Date(), erro: null },
        })
      );
      enviados += 1;
    } catch (erro) {
      if (erro instanceof SemNumeroDeWhatsapp) {
        // Configuracao que falta, nao falha do aviso: os pendentes ficam de pe
        // e saem no dia em que o escritorio conectar o numero.
        return { enviados, falhas, semNumero: true };
      }
      if (!(erro instanceof FalhaNoWhatsapp)) throw erro;

      const tentativas = erro.definitivo ? MAX_TENTATIVAS : aviso.tentativas + 1;
      await marcarFalha(escritorioId, aviso.id, tentativas, erro.message);
      falhas += 1;
    }
  }

  if (enviados > 0) await registrarConsumo(escritorioId, "WHATSAPP_MSG", enviados);
  return { enviados, falhas, semNumero: false };
}

async function marcarFalha(
  escritorioId: string,
  id: string,
  tentativas: number,
  motivo: string
): Promise<void> {
  await comEscritorio(escritorioId, (db) =>
    db.aviso.update({
      where: { id },
      data: {
        tentativas,
        erro: motivo.slice(0, 500),
        estado: tentativas >= MAX_TENTATIVAS ? "FALHOU" : "PENDENTE",
      },
    })
  );
}
