// O que precisa de atencao hoje.
//
// O painel antigo contava quantos clientes e quantos processos o escritorio
// tem. Isso e placa de parede: o numero nao muda o que a pessoa faz ao abrir o
// sistema de manha. O que muda e "o que vence", "o que esta marcado", "o que
// chegou e ninguem leu" e "o que era para ter entrado e nao entrou".
//
// Cada bloco respeita o modulo contratado: quem nao tem publicacoes nao ve
// bloco de publicacao, nem vazio.
import { comEscritorio } from "./prisma";
import { modulosAtivos, type Modulo } from "./modulos";
import { ehMesmoDiaEmBrasilia } from "./datas";

const DIA = 24 * 60 * 60 * 1000;

export type CompromissoDoDia = {
  id: string;
  titulo: string;
  tipo: string;
  inicio: Date;
  local: string | null;
  hoje: boolean;
};

export type PublicacaoNoPainel = {
  id: string;
  numeroProcesso: string | null;
  prazoDias: number | null;
  urgente: boolean;
  dataDisponibilizacao: Date;
  texto: string;
};

export type Pendencia = {
  /** Chave estavel, para o teste e para a tela nao dependerem do texto. */
  tipo:
    | "SEM_OAB"
    | "SEM_INTEGRACAO_EMAIL"
    | "INTEGRACAO_COM_ERRO"
    | "AVISOS_FALHADOS"
    | "SEM_CADASTRO_FISCAL";
  texto: string;
  /** Para onde a tela manda quem quiser resolver. */
  destino: string;
  /** So admin resolve; para os outros, mostrar seria ruido. */
  soAdmin: boolean;
};

export type Painel = {
  compromissos: CompromissoDoDia[];
  publicacoes: PublicacaoNoPainel[];
  naoLidas: number;
  cobrancasVencidas: { quantidade: number; totalCentavos: number };
  pendencias: Pendencia[];
  modulos: Modulo[];
};

/**
 * Monta o painel de um escritorio.
 *
 * Uma consulta por assunto, todas dentro do mesmo `comEscritorio` — abrir uma
 * transacao por bloco custaria cinco idas ao banco para montar uma tela.
 */
export async function montarPainel(
  escritorioId: string,
  agora = new Date(),
): Promise<Painel> {
  const modulos = await modulosAtivos(escritorioId);
  const tem = (modulo: Modulo) => modulos.includes(modulo);

  const fimDeAmanha = new Date(agora.getTime() + 2 * DIA);
  fimDeAmanha.setHours(23, 59, 59, 999);

  const dados = await comEscritorio(escritorioId, async (db) => ({
    compromissos: await db.compromisso.findMany({
      where: { concluido: false, inicio: { gte: agora, lte: fimDeAmanha } },
      orderBy: { inicio: "asc" },
      take: 10,
    }),
    publicacoes: tem("PUBLICACOES_DJEN")
      ? await db.publicacao.findMany({
          where: { lida: false, arquivada: false },
          orderBy: [{ urgente: "desc" }, { dataDisponibilizacao: "desc" }],
          take: 5,
        })
      : [],
    naoLidas: tem("PUBLICACOES_DJEN")
      ? await db.publicacao.count({ where: { lida: false, arquivada: false } })
      : 0,
    oabs: tem("PUBLICACOES_DJEN")
      ? await db.oabMonitorada.count({ where: { ativo: true } })
      : 1,
    cobrancas: tem("COBRANCAS")
      ? await db.cobranca.findMany({
          where: {
            status: { in: ["ABERTA", "VENCIDA"] },
            vencimento: { lt: agora },
          },
          select: { valorCentavos: true },
        })
      : [],
    integracoes: await db.integracao.findMany({
      select: { tipo: true, status: true },
    }),
    avisosFalhados:
      tem("EMAIL") || tem("WHATSAPP")
        ? await db.aviso.count({ where: { estado: "FALHOU" } })
        : 0,
    fiscal: tem("NFSE")
      ? await db.fiscal.findFirst({ select: { id: true } })
      : { id: "x" },
  }));

  const pendencias: Pendencia[] = [];

  if (tem("PUBLICACOES_DJEN") && dados.oabs === 0) {
    pendencias.push({
      tipo: "SEM_OAB",
      texto: "Nenhuma OAB monitorada: sem ela nao ha o que capturar no DJEN.",
      destino: "/publicacoes",
      soAdmin: true,
    });
  }

  if (tem("EMAIL") && !dados.integracoes.some((i) => i.tipo === "SMTP")) {
    pendencias.push({
      tipo: "SEM_INTEGRACAO_EMAIL",
      texto: "E-mail nao conectado: os avisos ficam parados esperando.",
      destino: "/integracoes",
      soAdmin: true,
    });
  }

  const comErro = dados.integracoes.filter((i) => i.status === "ERRO");
  if (comErro.length > 0) {
    pendencias.push({
      tipo: "INTEGRACAO_COM_ERRO",
      texto: `${comErro.length} integracao(oes) com erro: ${comErro
        .map((i) => i.tipo)
        .join(", ")}.`,
      destino: "/integracoes",
      soAdmin: true,
    });
  }

  if (dados.avisosFalhados > 0) {
    pendencias.push({
      tipo: "AVISOS_FALHADOS",
      texto: `${dados.avisosFalhados} aviso(s) nao chegaram ao destino.`,
      destino: "/integracoes",
      soAdmin: true,
    });
  }

  if (tem("NFSE") && !dados.fiscal) {
    pendencias.push({
      tipo: "SEM_CADASTRO_FISCAL",
      texto: "Cadastro fiscal incompleto: sem ele nao sai nota.",
      destino: "/notas",
      soAdmin: true,
    });
  }

  return {
    modulos,
    compromissos: dados.compromissos.map((c) => ({
      id: c.id,
      titulo: c.titulo,
      tipo: c.tipo,
      inicio: c.inicio,
      local: c.local,
      hoje: ehMesmoDiaEmBrasilia(c.inicio, agora),
    })),
    publicacoes: dados.publicacoes.map((p) => ({
      id: p.id,
      numeroProcesso: p.numeroProcesso,
      prazoDias: p.prazoDias,
      urgente: p.urgente,
      dataDisponibilizacao: p.dataDisponibilizacao,
      texto: p.texto,
    })),
    naoLidas: dados.naoLidas,
    cobrancasVencidas: {
      quantidade: dados.cobrancas.length,
      totalCentavos: dados.cobrancas.reduce(
        (total, c) => total + c.valorCentavos,
        0,
      ),
    },
    pendencias,
  };
}

/** Pendencia que esta pessoa pode resolver. Ruido para quem nao pode e ruido. */
export function pendenciasVisiveis(
  pendencias: Pendencia[],
  papel: string,
): Pendencia[] {
  return pendencias.filter((p) => !p.soAdmin || papel === "ADMIN");
}
