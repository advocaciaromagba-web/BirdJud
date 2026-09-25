// Captura das publicacoes do DJEN para um escritorio.
//
// Roda pela fila, um trabalho por escritorio. A mesma comunicacao pode chegar
// por duas OABs do mesmo escritorio; quem impede a duplicata e a chave
// (escritorioId, idExterno), nao a ordem em que as OABs sao percorridas.
import { comEscritorio, semEscritorio } from "./prisma";
import { buscarPeriodo, FalhaNoDjen, type Comunicacao } from "./djen";
import { normalizarNumeroProcesso, triar } from "./leitura-publicacao";
import { registrarConsumo } from "./consumo";

const DIA = 24 * 60 * 60 * 1000;

/** Dias para tras na primeira captura de uma OAB recem-cadastrada. */
export const JANELA_INICIAL_DIAS = 7;
/** Sobreposicao sobre a ultima captura, para nao perder publicacao de borda. */
export const SOBREPOSICAO_DIAS = 2;

export type ResultadoDaCaptura = {
  oabsConsultadas: number;
  recebidas: number;
  novas: number;
  vinculadas: number;
  falhas: { oab: string; motivo: string }[];
};

/** Periodo a consultar para uma OAB, dado quando ela foi capturada por ultimo. */
export function periodoDaConsulta(
  ultimaCaptura: Date | null,
  agora = new Date(),
): { de: Date; ate: Date } {
  if (!ultimaCaptura) {
    return {
      de: new Date(agora.getTime() - JANELA_INICIAL_DIAS * DIA),
      ate: agora,
    };
  }
  // A sobreposicao custa pouco (a deduplicacao descarta o repetido) e evita
  // perder o que o tribunal publicou logo depois da ultima consulta.
  const de = new Date(ultimaCaptura.getTime() - SOBREPOSICAO_DIAS * DIA);
  return { de: de > agora ? agora : de, ate: agora };
}

export async function capturarPublicacoes(
  escritorioId: string,
  agora = new Date(),
): Promise<ResultadoDaCaptura> {
  const oabs = await comEscritorio(escritorioId, (db) =>
    db.oabMonitorada.findMany({
      where: { ativo: true },
      orderBy: { criadoEm: "asc" },
    }),
  );

  const resultado: ResultadoDaCaptura = {
    oabsConsultadas: 0,
    recebidas: 0,
    novas: 0,
    vinculadas: 0,
    falhas: [],
  };

  for (const oab of oabs) {
    const rotulo = `${oab.numero}/${oab.uf}`;
    const { de, ate } = periodoDaConsulta(oab.ultimaCaptura, agora);

    let comunicacoes: Comunicacao[];
    try {
      comunicacoes = await buscarPeriodo({
        numeroOab: oab.numero,
        ufOab: oab.uf,
        de,
        ate,
      });
    } catch (erro) {
      // Uma OAB que falha nao derruba as outras: o escritorio recebe o que deu
      // para receber, e a falha aparece nomeada.
      resultado.falhas.push({
        oab: rotulo,
        motivo: erro instanceof FalhaNoDjen ? erro.message : String(erro),
      });
      continue;
    }

    resultado.oabsConsultadas += 1;
    resultado.recebidas += comunicacoes.length;

    for (const comunicacao of comunicacoes) {
      const gravou = await gravarPublicacao(escritorioId, comunicacao, rotulo);
      if (gravou.nova) resultado.novas += 1;
      if (gravou.vinculada) resultado.vinculadas += 1;
    }

    // So marca a captura quando a OAB foi consultada sem erro.
    await comEscritorio(escritorioId, (db) =>
      db.oabMonitorada.update({
        where: { id: oab.id },
        data: { ultimaCaptura: agora },
      }),
    );
  }

  // Medicao do modulo: o custo do DJEN cresce por OAB consultada.
  if (resultado.oabsConsultadas > 0) {
    await registrarConsumo(
      escritorioId,
      "OAB_MONITORADA",
      resultado.oabsConsultadas,
    );
  }

  return resultado;
}

async function gravarPublicacao(
  escritorioId: string,
  comunicacao: Comunicacao,
  oab: string,
): Promise<{ nova: boolean; vinculada: boolean }> {
  const numero = normalizarNumeroProcesso(comunicacao.numeroProcesso);
  const triagem = triar(comunicacao.texto);

  return comEscritorio(escritorioId, async (db) => {
    const jaExiste = await db.publicacao.findFirst({
      where: { idExterno: comunicacao.idExterno },
      select: { id: true },
    });
    if (jaExiste) return { nova: false, vinculada: false };

    // Vincula ao processo quando o escritorio ja o tem cadastrado.
    const processo = numero
      ? await db.processo.findFirst({ where: { numero }, select: { id: true } })
      : null;

    await db.publicacao.create({
      data: semEscritorio({
        idExterno: comunicacao.idExterno,
        processoId: processo?.id ?? null,
        numeroProcesso: numero,
        tribunal: comunicacao.tribunal,
        orgao: comunicacao.orgao,
        tipoComunicacao: comunicacao.tipoComunicacao,
        texto: comunicacao.texto,
        link: comunicacao.link,
        oab,
        dataDisponibilizacao: comunicacao.dataDisponibilizacao,
        urgente: triagem.urgente,
        prazoDias: triagem.prazoDias,
      }),
    });

    return { nova: true, vinculada: processo !== null };
  });
}
