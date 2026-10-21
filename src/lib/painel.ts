// O que precisa de atencao hoje.
//
// O painel antigo contava quantos clientes e quantos processos o escritorio
// tem. Isso e placa de parede: o numero nao muda o que a pessoa faz ao abrir o
// sistema de manha. O que muda e "o que vence", "o que esta marcado", "o que
// chegou e ninguem leu" e "o que era para ter entrado e nao entrou".
//
// Cada bloco respeita o modulo contratado: quem nao tem publicacoes nao ve
// bloco de publicacao, nem vazio.
import { contarParaOPainel } from "./entrega-do-escritorio";
import { comEscritorio } from "./prisma";
import { modulosAtivos, type Modulo } from "./modulos";
import { diaEmBrasilia, ehMesmoDiaEmBrasilia } from "./datas";
import { urgenciaDoPrazo } from "./prazos-do-escritorio";

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
    | "SEM_CADASTRO_FISCAL"
    | "SEM_CNPJ"
    | "PRAZO_APERTADO";
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
  /**
   * O que ENTROU no mes corrente (receita com baixa), com o que ainda esta
   * para entrar ate o fim do mes. Nulo sem o modulo Financeiro. A tela so
   * mostra ao administrador: o financeiro e fechado por papel.
   */
  recebidoNoMes: { totalCentavos: number; quantidade: number; previstoCentavos: number } | null;
  pendencias: Pendencia[];
  modulos: Modulo[];
};

/** Inicio e fim (exclusivo) do mes corrente em Brasilia (UTC-3, sem horario de verao). */
export function mesEmBrasilia(agora: Date): { inicio: Date; fim: Date } {
  const [ano, mes] = diaEmBrasilia(agora).split("-").map(Number);
  const inicio = new Date(Date.UTC(ano, mes - 1, 1, 3));
  const fim = new Date(Date.UTC(ano, mes, 1, 3));
  return { inicio, fim };
}

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
  const mes = mesEmBrasilia(agora);

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
    recebidoNoMes: tem("FINANCEIRO")
      ? await db.lancamento.findMany({
          where: { tipo: "RECEITA", pagoEm: { gte: mes.inicio, lt: mes.fim } },
          select: { valorCentavos: true },
        })
      : null,
    aReceberNoMes: tem("FINANCEIRO")
      ? await db.lancamento.findMany({
          where: {
            tipo: "RECEITA",
            pagoEm: null,
            vencimento: { gte: agora, lt: mes.fim },
          },
          select: { valorCentavos: true },
        })
      : [],
    integracoes: await db.integracao.findMany({
      select: { tipo: true, status: true },
    }),
    fiscal: tem("NFSE")
      ? await db.fiscal.findFirst({ select: { id: true } })
      : { id: "x" },
    escritorio: await db.escritorio.findFirst({
      where: { id: escritorioId },
      select: { cnpj: true },
    }),
    // Prazo e a unica coisa aqui cujo erro nao tem conserto depois. Desde a
    // separacao agenda x tarefas, prazo mora na TAREFA: conta o prazo fatal
    // quando ha, senao a entrega. Metas da equipe nao sao prazo.
    prazos: await db.tarefa.findMany({
      where: { situacao: { not: "CONCLUIDA" }, meta: false },
      select: { vencimento: true, prazoFatal: true },
      orderBy: { vencimento: "asc" },
      take: 500,
    }),
  }));

  const pendencias: Pendencia[] = [];

  // PRIMEIRO de todas, sempre: perder prazo perde direito, e nenhuma outra
  // pendencia desta lista tem esse peso. Fica visivel para TODO MUNDO, nao so
  // para o admin — quem cumpre o prazo raramente e quem administra o sistema.
  const hojeISO = diaEmBrasilia(agora);
  const apertados = dados.prazos.filter((p) => {
    const vence = diaEmBrasilia(p.prazoFatal ?? p.vencimento);
    const { urgencia } = urgenciaDoPrazo(vence, hojeISO);
    return urgencia !== "EM_CURSO";
  }).length;
  if (apertados > 0) {
    pendencias.push({
      tipo: "PRAZO_APERTADO",
      texto:
        apertados === 1
          ? "1 tarefa com prazo hoje, a três dias úteis ou já vencida."
          : `${apertados} tarefas com prazo hoje, a três dias úteis ou já vencidas.`,
      destino: "/tarefas",
      soAdmin: false,
    });
  }

  if (tem("PUBLICACOES_DJEN") && dados.oabs === 0) {
    pendencias.push({
      tipo: "SEM_OAB",
      texto: "Nenhuma OAB monitorada: sem ela não há o que capturar no DJEN.",
      destino: "/publicacoes",
      soAdmin: true,
    });
  }

  if (tem("EMAIL") && !dados.integracoes.some((i) => i.tipo === "SMTP")) {
    pendencias.push({
      tipo: "SEM_INTEGRACAO_EMAIL",
      texto: "E-mail não conectado: os avisos ficam parados esperando.",
      destino: "/integracoes",
      soAdmin: true,
    });
  }

  const comErro = dados.integracoes.filter((i) => i.status === "ERRO");
  if (comErro.length > 0) {
    pendencias.push({
      tipo: "INTEGRACAO_COM_ERRO",
      texto: `${comErro.length} integração(oes) com erro: ${comErro
        .map((i) => i.tipo)
        .join(", ")}.`,
      destino: "/integracoes",
      soAdmin: true,
    });
  }

  // Mensagem que nao chegou ao cliente e assunto de quem atende, nao so do
  // administrador: a pendencia leva a tela onde se reenvia ou se resolve.
  const naoChegaram = tem("EMAIL") || tem("WHATSAPP") ? await contarParaOPainel(escritorioId, agora) : 0;
  if (naoChegaram > 0) {
    pendencias.push({
      tipo: "AVISOS_FALHADOS",
      texto: `${naoChegaram} mensagem(ns) podem não ter chegado ao destino. Reenvie ou avise por outro meio.`,
      destino: "/mensagens",
      soAdmin: false,
    });
  }

  /*
   * CNPJ.
   *
   * Aparece ANTES de fazer falta, de proposito: sem ele o meio de pagamento
   * recusa emitir a fatura da assinatura, e a descoberta seria no primeiro
   * vencimento — com o escritorio devendo uma fatura que nunca lhe foi
   * apresentada. Aviso em cima do prazo nao e aviso.
   */
  if (!dados.escritorio?.cnpj) {
    pendencias.push({
      tipo: "SEM_CNPJ",
      texto:
        "CNPJ do escritório não informado: sem ele a fatura da assinatura não pode ser emitida.",
      destino: "/administracao",
      soAdmin: true,
    });
  }

  if (tem("NFSE") && !dados.fiscal) {
    pendencias.push({
      tipo: "SEM_CADASTRO_FISCAL",
      texto: "Cadastro fiscal incompleto: sem ele não sai nota.",
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
    recebidoNoMes: dados.recebidoNoMes
      ? {
          totalCentavos: dados.recebidoNoMes.reduce((t, l) => t + l.valorCentavos, 0),
          quantidade: dados.recebidoNoMes.length,
          previstoCentavos: dados.aReceberNoMes.reduce((t, l) => t + l.valorCentavos, 0),
        }
      : null,
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
