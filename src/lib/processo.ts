// A ficha do processo: tudo o que o escritorio tem sobre um caso, junto.
//
// Sem isto, quem atende um cliente ao telefone precisa abrir quatro telas e
// juntar de cabeca — publicacoes em uma, agenda em outra, documentos na
// terceira, honorarios na quarta. O trabalho de advogado e por caso, e a tela
// precisa ser por caso tambem.
//
// Cada bloco respeita o modulo contratado, como no painel.
import { comEscritorio } from "./prisma";
import { modulosAtivos, type Modulo } from "./modulos";

export type FichaDoProcesso = {
  processo: {
    id: string;
    numero: string;
    tribunal: string | null;
    vara: string | null;
    area: string | null;
    situacao: string;
    distribuicao: Date | null;
    cliente: { id: string; nome: string; documento: string | null } | null;
  };
  publicacoes: {
    id: string;
    texto: string;
    dataDisponibilizacao: Date;
    urgente: boolean;
    prazoDias: number | null;
    lida: boolean;
  }[];
  compromissos: {
    id: string;
    titulo: string;
    tipo: string;
    inicio: Date;
    local: string | null;
    concluido: boolean;
  }[];
  arquivos: {
    id: string;
    nome: string;
    tamanhoBytes: number;
    criadoEm: Date;
  }[];
  cobrancas: {
    id: string;
    descricao: string;
    valorCentavos: number;
    vencimento: Date;
    status: string;
  }[];
  modulos: Modulo[];
};

/** null quando o processo nao e deste escritorio — quem decide e o RLS. */
export async function fichaDoProcesso(
  escritorioId: string,
  id: string,
): Promise<FichaDoProcesso | null> {
  const modulos = await modulosAtivos(escritorioId);
  const tem = (modulo: Modulo) => modulos.includes(modulo);

  const processo = await comEscritorio(escritorioId, (db) =>
    db.processo.findUnique({
      where: { id },
      include: {
        cliente: { select: { id: true, nome: true, documento: true } },
      },
    }),
  );
  if (!processo) return null;

  const dados = await comEscritorio(escritorioId, async (db) => ({
    publicacoes: tem("PUBLICACOES_DJEN")
      ? await db.publicacao.findMany({
          where: { processoId: id },
          orderBy: { dataDisponibilizacao: "desc" },
          take: 50,
        })
      : [],
    compromissos: await db.compromisso.findMany({
      where: { processoId: id },
      orderBy: { inicio: "desc" },
      take: 50,
    }),
    arquivos: tem("NUVEM")
      ? await db.arquivo.findMany({
          where: { processoId: id },
          orderBy: { criadoEm: "desc" },
          take: 50,
        })
      : [],
    cobrancas: tem("COBRANCAS")
      ? await db.cobranca.findMany({
          where: { processoId: id },
          orderBy: { vencimento: "desc" },
          take: 50,
        })
      : [],
  }));

  return {
    modulos,
    processo: {
      id: processo.id,
      numero: processo.numero,
      tribunal: processo.tribunal,
      vara: processo.vara,
      area: processo.area,
      situacao: processo.situacao,
      distribuicao: processo.distribuicao,
      cliente: processo.cliente,
    },
    publicacoes: dados.publicacoes.map((p) => ({
      id: p.id,
      texto: p.texto,
      dataDisponibilizacao: p.dataDisponibilizacao,
      urgente: p.urgente,
      prazoDias: p.prazoDias,
      lida: p.lida,
    })),
    compromissos: dados.compromissos.map((c) => ({
      id: c.id,
      titulo: c.titulo,
      tipo: c.tipo,
      inicio: c.inicio,
      local: c.local,
      concluido: c.concluido,
    })),
    arquivos: dados.arquivos.map((a) => ({
      id: a.id,
      nome: a.nome,
      tamanhoBytes: a.tamanhoBytes,
      criadoEm: a.criadoEm,
    })),
    cobrancas: dados.cobrancas.map((c) => ({
      id: c.id,
      descricao: c.descricao,
      valorCentavos: c.valorCentavos,
      vencimento: c.vencimento,
      status: c.status,
    })),
  };
}
