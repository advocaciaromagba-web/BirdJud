// Os fatos do escritorio para o roteiro de primeiros passos, e as decisoes
// que a pessoa toma sobre ele (pular, retomar, dispensar da tela inicial).
import { Prisma } from "@prisma/client";
import { comEscritorio } from "./prisma";
import { modulosAtivos } from "./modulos";
import { NUVENS } from "./nuvem";
import { montarRoteiro, podePular, type Fatos, type Roteiro } from "./primeiros-passos";

type Decisoes = {
  pulados?: Record<string, { em: string; por: string | null }>;
  dispensadoEm?: string | null;
};

function lerDecisoes(valor: unknown): Decisoes {
  return valor && typeof valor === "object" ? (valor as Decisoes) : {};
}

export async function fatosDoEscritorio(escritorioId: string): Promise<{ fatos: Fatos; dispensado: boolean }> {
  const modulos = await modulosAtivos(escritorioId);
  const d = await comEscritorio(escritorioId, async (db) => ({
    escritorio: await db.escritorio.findFirst({
      where: { id: escritorioId },
      select: {
        senhaAdminHash: true,
        cnpj: true,
        telefoneAtendimento: true,
        logoUrl: true,
        primeirosPassos: true,
      },
    }),
    advogados: await db.usuario.findMany({
      where: { ativo: true, OR: [{ advogado: true }, { papel: "ADVOGADO" }] },
      select: { oab: true },
    }),
    oabs: await db.oabMonitorada.count({ where: { ativo: true } }),
    integracoes: await db.integracao.findMany({ select: { tipo: true, status: true } }),
    fiscal: await db.fiscal.findFirst({ select: { id: true } }),
    comWhatsapp: await db.usuario.count({
      where: { ativo: true, recebeWhatsapp: true, telefone: { not: null } },
    }),
    modelos: await db.modeloDeDocumento.count(),
    clientes: await db.cliente.count(),
    processos: await db.processo.count(),
    compromissos: await db.compromisso.count(),
  }));

  const decisoes = lerDecisoes(d.escritorio?.primeirosPassos);
  const fatos: Fatos = {
    modulos,
    temSenhaAdmin: Boolean(d.escritorio?.senhaAdminHash),
    cnpj: Boolean(d.escritorio?.cnpj?.trim()),
    telefoneAtendimento: Boolean(d.escritorio?.telefoneAtendimento?.trim()),
    logo: Boolean(d.escritorio?.logoUrl),
    advogados: d.advogados.length,
    advogadosComOab: d.advogados.filter((a) => a.oab?.trim()).length,
    oabsMonitoradas: d.oabs,
    integracoes: Object.fromEntries(d.integracoes.map((i) => [i.tipo, i.status])),
    nuvemDisponivel: NUVENS.MICROSOFT.configurada() || NUVENS.GOOGLE.configurada(),
    temCadastroFiscal: Boolean(d.fiscal),
    pessoasComWhatsapp: d.comWhatsapp,
    modelos: d.modelos,
    clientes: d.clientes,
    processos: d.processos,
    compromissos: d.compromissos,
    pulados: Object.fromEntries(
      Object.entries(decisoes.pulados ?? {}).map(([k, v]) => [k, v.em]),
    ),
  };
  return { fatos, dispensado: Boolean(decisoes.dispensadoEm) };
}

export async function roteiroDoEscritorio(
  escritorioId: string,
): Promise<Roteiro & { dispensado: boolean }> {
  const { fatos, dispensado } = await fatosDoEscritorio(escritorioId);
  return { ...montarRoteiro(fatos), dispensado };
}

export class PassoNaoPulavel extends Error {
  readonly status = 400;
  constructor() {
    super("Este passo e essencial e nao pode ser pulado.");
    this.name = "PassoNaoPulavel";
  }
}

async function mudarDecisoes(escritorioId: string, mudar: (d: Decisoes) => Decisoes): Promise<void> {
  await comEscritorio(escritorioId, async (db) => {
    const atual = await db.escritorio.findFirst({
      where: { id: escritorioId },
      select: { primeirosPassos: true },
    });
    const novo = mudar(lerDecisoes(atual?.primeirosPassos));
    await db.escritorio.update({
      where: { id: escritorioId },
      data: { primeirosPassos: novo as Prisma.InputJsonValue },
    });
  });
}

export async function pularPasso(escritorioId: string, chave: string, nome: string | null): Promise<void> {
  if (!podePular(chave)) throw new PassoNaoPulavel();
  await mudarDecisoes(escritorioId, (d) => ({
    ...d,
    pulados: { ...(d.pulados ?? {}), [chave]: { em: new Date().toISOString(), por: nome } },
  }));
}

export async function retomarPasso(escritorioId: string, chave: string): Promise<void> {
  await mudarDecisoes(escritorioId, (d) => {
    const pulados = { ...(d.pulados ?? {}) };
    delete pulados[chave];
    return { ...d, pulados };
  });
}

/** Tira (ou devolve) o guia da tela inicial. A pagina do guia continua la. */
export async function dispensarDoInicio(escritorioId: string, dispensar: boolean): Promise<void> {
  await mudarDecisoes(escritorioId, (d) => ({
    ...d,
    dispensadoEm: dispensar ? new Date().toISOString() : null,
  }));
}
