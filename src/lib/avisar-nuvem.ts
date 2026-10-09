// Chama a rotina da nuvem quando algo muda (cliente novo, documento novo).
//
// Nunca lanca: quem chama e o cadastro do cliente ou o envio do documento, e
// nenhum dos dois pode falhar porque a nuvem esta fora. Sem nuvem conectada,
// nao poe nada na fila.
import { enfileirar } from "./fila";
import { prismaPlataforma } from "./prisma";
import { nuvemConectada } from "./nuvem-do-escritorio";

export async function cutucarNuvem(escritorioId: string): Promise<void> {
  try {
    if (!(await nuvemConectada(escritorioId))) return;
    // Vinte documentos subidos de uma vez sao UMA rodada, nao vinte: a que
    // ja esta na fila e ainda nao comecou vai pegar todos.
    const jaNaFila = await prismaPlataforma().trabalho.findFirst({
      where: { escritorioId, tipo: "ORGANIZAR_NUVEM", estado: "PENDENTE" },
      select: { id: true },
    });
    if (jaNaFila) return;
    await enfileirar("ORGANIZAR_NUVEM", escritorioId);
  } catch (erro) {
    console.log(`nuvem ${escritorioId}: rotina nao agendada ${(erro as Error).message}`.slice(0, 300));
  }
}
