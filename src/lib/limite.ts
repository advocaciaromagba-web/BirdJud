// Limite de tentativas por chave (IP, e-mail), em janela deslizante.
//
// A contagem fica no banco, nao na memoria: com mais de uma instancia da
// aplicacao, contar em memoria daria N vezes o limite configurado. O incremento
// e feito em uma unica instrucao SQL, entao duas requisicoes simultaneas nao se
// atropelam.
//
// Isto contem abuso simples. Ataque distribuido continua sendo problema do
// provedor, antes da aplicacao.
import { prismaPlataforma } from "./prisma";

export type ResultadoDoLimite = {
  permitido: boolean;
  restantes: number;
  esperarSegundos: number;
};

type Linha = { tentativas: number; ate: Date };

export async function registrarTentativa(
  chave: string,
  maximo: number,
  janelaSegundos: number,
): Promise<ResultadoDoLimite> {
  const janelaMs = janelaSegundos * 1000;

  // ON CONFLICT resolve tudo em uma ida ao banco: se a janela anterior ja
  // venceu, a contagem recomeca; se nao, incrementa dentro dela.
  const linhas = await prismaPlataforma().$queryRaw<Linha[]>`
    INSERT INTO "LimiteDeTaxa" ("chave", "tentativas", "ate")
    VALUES (${chave}, 1, now() + ${`${janelaSegundos} seconds`}::interval)
    ON CONFLICT ("chave") DO UPDATE SET
      "tentativas" = CASE
        WHEN "LimiteDeTaxa"."ate" <= now() THEN 1
        ELSE "LimiteDeTaxa"."tentativas" + 1
      END,
      "ate" = CASE
        WHEN "LimiteDeTaxa"."ate" <= now()
          THEN now() + ${`${janelaSegundos} seconds`}::interval
        ELSE "LimiteDeTaxa"."ate"
      END
    RETURNING "tentativas", "ate"
  `;

  const linha = linhas[0];
  if (!linha) {
    // Sem resposta do banco, nao e hora de bloquear o cliente legitimo.
    return { permitido: true, restantes: maximo - 1, esperarSegundos: 0 };
  }

  if (linha.tentativas > maximo) {
    const esperar = Math.max(
      1,
      Math.ceil((linha.ate.getTime() - Date.now()) / 1000),
    );
    return {
      permitido: false,
      restantes: 0,
      esperarSegundos: Math.min(esperar, janelaSegundos),
    };
  }

  return {
    permitido: true,
    restantes: maximo - linha.tentativas,
    esperarSegundos: 0,
  };
}

/** Apaga janelas ja vencidas. Chamado pela rotina de manutencao. */
export async function limparLimitesVencidos(): Promise<number> {
  const { count } = await prismaPlataforma().limiteDeTaxa.deleteMany({
    where: { ate: { lte: new Date() } },
  });
  return count;
}

/** So para os testes. */
export async function zerarLimites(): Promise<void> {
  await prismaPlataforma().limiteDeTaxa.deleteMany({});
}
