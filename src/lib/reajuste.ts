// Reajuste das mensalidades com valor fechado.
//
// O contrato (clausula 4) diz: o valor contratado nao muda com a tabela, e o
// reajuste e anual pelo IPCA. Esta e a ferramenta desse reajuste: aplica um
// percentual ao valor fechado de cada escritorio, mostra a previa antes, deixa
// de fora por padrao quem foi reajustado ha menos de 12 meses, registra a data
// e avisa o administrador do escritorio por e-mail.
//
// Escritorio sem valor fechado (zero) segue a tabela e nao entra aqui: ele
// acompanha a tabela do Financeiro.
import { prismaPlataforma } from "./prisma";
import { registrarAcessoSuporte } from "./plataforma";
import { enviarPelaPlataforma, temRemetenteDaPlataforma } from "./email-plataforma";
import { emReais } from "./dinheiro";

const ANO = 365 * 24 * 60 * 60 * 1000;

/**
 * Valor reajustado, arredondado ao centavo (meio centavo para cima). A conta
 * e em pontos-base inteiros: 1 + 4,5% = 1,045 nao e exato em ponto flutuante,
 * e R$ 312,455 cairia para baixo.
 */
export function valorReajustado(valorCentavos: number, percentual: number): number {
  const fator = Math.round((100 + percentual) * 100); // 104,5% -> 10450
  return Math.round((valorCentavos * fator) / 10_000);
}

export type LinhaDoReajuste = {
  escritorioId: string;
  nome: string;
  atualCentavos: number;
  novoCentavos: number;
  /** Ultimo reajuste ou, sem nenhum, o inicio da assinatura. */
  desde: Date;
  /** Reajustado (ou assinado) ha menos de 12 meses: fica de fora por padrao. */
  recente: boolean;
};

/** Quem seria reajustado, e para quanto. Nao grava nada. */
export async function previaDoReajuste(percentual: number, agora = new Date()): Promise<LinhaDoReajuste[]> {
  const assinaturas = await prismaPlataforma().assinatura.findMany({
    where: { valorCentavos: { gt: 0 }, canceladaEm: null, escritorio: { status: { not: "ENCERRADO" } } },
    select: {
      escritorioId: true,
      valorCentavos: true,
      reajustadoEm: true,
      criadaEm: true,
      escritorio: { select: { nome: true } },
    },
    orderBy: { escritorio: { nome: "asc" } },
  });
  return assinaturas.map((a) => {
    const desde = a.reajustadoEm ?? a.criadaEm;
    return {
      escritorioId: a.escritorioId,
      nome: a.escritorio.nome,
      atualCentavos: a.valorCentavos,
      novoCentavos: valorReajustado(a.valorCentavos, percentual),
      desde,
      recente: agora.getTime() - desde.getTime() < ANO,
    };
  });
}

export type ResultadoDoReajuste = { reajustados: number; avisados: number; deFora: number };

export async function aplicarReajuste(
  percentual: number,
  opcoes: { incluirRecentes: boolean; avisar: boolean; operadorId: string; agora?: Date },
): Promise<ResultadoDoReajuste> {
  const agora = opcoes.agora ?? new Date();
  const linhas = await previaDoReajuste(percentual, agora);
  const alvo = linhas.filter((l) => opcoes.incluirRecentes || !l.recente);
  let avisados = 0;
  for (const l of alvo) {
    await prismaPlataforma().assinatura.update({
      where: { escritorioId: l.escritorioId },
      data: { valorCentavos: l.novoCentavos, reajustadoEm: agora },
    });
    await registrarAcessoSuporte(
      opcoes.operadorId,
      l.escritorioId,
      `Reajuste de ${percentual}%: ${emReais(l.atualCentavos)} -> ${emReais(l.novoCentavos)}`,
    );
    if (opcoes.avisar && temRemetenteDaPlataforma()) {
      const admin = await prismaPlataforma().usuario.findFirst({
        where: { escritorioId: l.escritorioId, papel: "ADMIN", ativo: true },
        orderBy: { criadoEm: "asc" },
        select: { email: true },
      });
      if (admin?.email) {
        try {
          await enviarPelaPlataforma({
            para: admin.email,
            assunto: "BirdJud — reajuste anual da mensalidade",
            texto: [
              `${l.nome},`,
              "",
              `A mensalidade do BirdJud foi reajustada em ${String(percentual).replace(".", ",")}%, conforme a cláusula 4 do contrato (reajuste anual pelo IPCA).`,
              "",
              `Valor anterior: ${emReais(l.atualCentavos)}`,
              `Valor novo: ${emReais(l.novoCentavos)}`,
              "",
              "O valor novo vale a partir da próxima fatura. Faturas já emitidas não mudam.",
              "",
              "Dúvidas: responda este e-mail ou fale pelo WhatsApp do site.",
            ].join("\n"),
          });
          avisados += 1;
        } catch (e) {
          console.error(`reajuste: aviso para ${l.escritorioId} nao saiu — ${(e as Error).message}`);
        }
      }
    }
  }
  return { reajustados: alvo.length, avisados, deFora: linhas.length - alvo.length };
}
