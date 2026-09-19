// Encerramento do escritorio e exclusao depois do prazo de retencao.
//
// Sao dois momentos de proposito: encerrar interrompe o servico e comeca a
// contar o prazo; purgar apaga. Entre um e outro o escritorio ainda consegue
// exportar o que e dele — e a promessa do contrato e da LGPD.
import { prismaPlataforma } from "./prisma";
import { PRAZO_DE_RETENCAO_DIAS } from "./juridico";
import { apagarTudoDoEscritorio } from "./armazenamento";

const DIA = 24 * 60 * 60 * 1000;

export function podePurgar(
  encerradoEm: Date | null,
  purgadoEm: Date | null,
  agora = new Date(),
  prazoDias = PRAZO_DE_RETENCAO_DIAS
): boolean {
  if (!encerradoEm || purgadoEm) return false;
  return agora.getTime() - encerradoEm.getTime() >= prazoDias * DIA;
}

export async function encerrarEscritorio(escritorioId: string, agora = new Date()) {
  return prismaPlataforma().escritorio.update({
    where: { id: escritorioId },
    data: { status: "ENCERRADO", encerradoEm: agora },
  });
}

/** Desfaz o encerramento enquanto o prazo de retencao ainda corre. */
export async function reativarEscritorio(escritorioId: string) {
  return prismaPlataforma().escritorio.update({
    where: { id: escritorioId },
    data: { status: "ATIVO", encerradoEm: null },
  });
}

export type ResultadoDaPurga = {
  apagados: number;
  escritorios: string[];
};

/**
 * Apaga os dados dos escritorios encerrados ha mais tempo que o prazo.
 *
 * **Vai embora:** usuarios, clientes, processos, agenda, lancamentos,
 * publicacoes, avisos, analises de IA, OABs monitoradas, cobrancas, arquivos
 * (a linha e o byte no disco), integracoes (com as credenciais), consumo,
 * modulos e os trabalhos da fila.
 *
 * **Fica, de proposito:** faturas, assinatura e aceites de termos. Sao registro
 * fiscal e prova de contrato, que a plataforma precisa guardar por obrigacao
 * propria — e por isso o acordo de LGPD diz que ficam, em base separada dos
 * dados do escritorio. Fica tambem a casca do escritorio (id, slug, nome,
 * `purgadoEm`), para constar que a purga aconteceu.
 */
export async function purgarEncerrados(agora = new Date()): Promise<ResultadoDaPurga> {
  const limite = new Date(agora.getTime() - PRAZO_DE_RETENCAO_DIAS * DIA);

  const candidatos = await prismaPlataforma().escritorio.findMany({
    where: {
      status: "ENCERRADO",
      encerradoEm: { not: null, lte: limite },
      purgadoEm: null,
    },
    select: { id: true, slug: true },
  });

  for (const escritorio of candidatos) {
    // Em uma transacao: ou some tudo, ou nao some nada.
    await prismaPlataforma().$transaction([
      prismaPlataforma().usuario.deleteMany({ where: { escritorioId: escritorio.id } }),
      prismaPlataforma().cliente.deleteMany({ where: { escritorioId: escritorio.id } }),
      prismaPlataforma().processo.deleteMany({ where: { escritorioId: escritorio.id } }),
      prismaPlataforma().compromisso.deleteMany({ where: { escritorioId: escritorio.id } }),
      prismaPlataforma().lancamento.deleteMany({ where: { escritorioId: escritorio.id } }),
      // Modulos que vieram depois da fase 5. Sem estas linhas, publicacao e
      // analise de IA sobreviviam a purga — dado de cliente que a LGPD e o
      // nosso proprio contrato mandam apagar.
      prismaPlataforma().arquivo.deleteMany({ where: { escritorioId: escritorio.id } }),
      prismaPlataforma().cobranca.deleteMany({ where: { escritorioId: escritorio.id } }),
      prismaPlataforma().analiseIA.deleteMany({ where: { escritorioId: escritorio.id } }),
      prismaPlataforma().aviso.deleteMany({ where: { escritorioId: escritorio.id } }),
      prismaPlataforma().publicacao.deleteMany({ where: { escritorioId: escritorio.id } }),
      prismaPlataforma().oabMonitorada.deleteMany({ where: { escritorioId: escritorio.id } }),
      prismaPlataforma().integracao.deleteMany({ where: { escritorioId: escritorio.id } }),
      prismaPlataforma().consumoMensal.deleteMany({ where: { escritorioId: escritorio.id } }),
      prismaPlataforma().moduloContratado.deleteMany({ where: { escritorioId: escritorio.id } }),
      // Trabalhos da fila carregam payload do escritorio: vao junto.
      prismaPlataforma().trabalho.deleteMany({ where: { escritorioId: escritorio.id } }),
      prismaPlataforma().escritorio.update({
        where: { id: escritorio.id },
        data: { purgadoEm: agora },
      }),
    ]);

    // Depois do commit: disco nao participa de transacao, e apagar byte de
    // escritorio que ja nao tem linha nenhuma e sempre seguro.
    await apagarTudoDoEscritorio(escritorio.id);
  }

  return { apagados: candidatos.length, escritorios: candidatos.map((e) => e.slug) };
}
