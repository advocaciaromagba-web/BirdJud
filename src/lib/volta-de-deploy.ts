/**
 * Quando voltar sozinho para a versao anterior.
 *
 * POR QUE EXISTE: o servico da aplicacao tem volume montado, e volume nao se
 * divide entre duas instancias. O Railway precisa parar a versao antiga para
 * soltar o volume antes de subir a nova — entao um deploy que falha na
 * partida nao e "a versao nova nao entrou", e o site fora do ar, sem versao
 * anterior rodando para onde voltar. Em 07/10/2026 isso custou oito minutos,
 * e so terminou porque alguem estava olhando.
 *
 * Este modulo e so a DECISAO: recebe o que se observou e diz se volta e para
 * onde. Quem bate no healthcheck e quem chama a API do Railway fica de fora,
 * para que a regra possa ser testada sem rede.
 *
 * A regra erra para o lado de nao mexer. Voltar sozinho e uma acao forte:
 * descarta a versao nova e pode esconder o defeito de quem a enviou. So
 * acontece quando as tres coisas valem ao mesmo tempo.
 */

export type EstadoDeDeploy = {
  id: string;
  /** SUCCESS, FAILED, CRASHED, BUILDING, DEPLOYING, QUEUED, REMOVED... */
  situacao: string;
  criadoEm: string;
};

export type Volta = { paraId: string; quando: number };

export type Observacao = {
  /** Resultados das ultimas batidas no healthcheck, da mais velha para a mais nova. */
  saude: boolean[];
  /** Deploys do mais novo para o mais velho, como a API do Railway devolve. */
  deploys: EstadoDeDeploy[];
  /** A ultima volta que ESTE vigia mandou fazer, se houve. */
  ultimaVolta: Volta | null;
  agora: number;
};

export type Decisao =
  | { acao: "nada"; motivo: string }
  | { acao: "voltar"; alvo: EstadoDeDeploy; motivo: string };

/** Tres batidas seguidas sem resposta. A 30s cada, sao 90 segundos de queda. */
export const FALHAS_SEGUIDAS = 3;

/**
 * Nao manda a mesma volta duas vezes dentro desta janela.
 *
 * Sem isso, uma versao antiga que tambem nao sobe — porque o problema e o
 * banco, nao o codigo — vira um laco de deploys que piora tudo.
 */
export const JANELA_ENTRE_VOLTAS_MS = 30 * 60_000;

/** Situacoes em que o deploy terminou mal. */
const TERMINOU_MAL = new Set(["FAILED", "CRASHED"]);

/** Situacoes em que ainda esta acontecendo: esperar, nunca mexer. */
const EM_ANDAMENTO = new Set([
  "QUEUED",
  "BUILDING",
  "DEPLOYING",
  "INITIALIZING",
  "WAITING",
  "NEEDS_APPROVAL",
  "SKIPPED",
]);

export function decidir({
  saude,
  deploys,
  ultimaVolta,
  agora,
}: Observacao): Decisao {
  const ultimas = saude.slice(-FALHAS_SEGUIDAS);
  if (ultimas.length < FALHAS_SEGUIDAS || ultimas.some(Boolean)) {
    return { acao: "nada", motivo: "o site respondeu em alguma das ultimas batidas" };
  }

  const atual = deploys[0];
  if (!atual) return { acao: "nada", motivo: "sem deploy conhecido" };

  if (EM_ANDAMENTO.has(atual.situacao)) {
    // A janela de indisponibilidade do deploy e esperada. Voltar no meio dela
    // seria cancelar uma versao que talvez estivesse prestes a subir.
    return { acao: "nada", motivo: `deploy em andamento (${atual.situacao})` };
  }

  if (!TERMINOU_MAL.has(atual.situacao)) {
    // O deploy no ar deu certo e mesmo assim o site nao responde: o problema
    // nao e a versao. Pode ser banco, volume, rede. Voltar nao conserta, e
    // troca um problema conhecido por um desconhecido.
    return {
      acao: "nada",
      motivo: `o deploy no ar esta ${atual.situacao}: a queda nao e da versao`,
    };
  }

  const alvo = deploys.slice(1).find((d) => d.situacao === "SUCCESS");
  if (!alvo) return { acao: "nada", motivo: "nao ha versao anterior que tenha subido" };

  if (
    ultimaVolta &&
    ultimaVolta.paraId === alvo.id &&
    agora - ultimaVolta.quando < JANELA_ENTRE_VOLTAS_MS
  ) {
    return {
      acao: "nada",
      motivo: "esta volta ja foi tentada ha pouco e nao resolveu",
    };
  }

  return {
    acao: "voltar",
    alvo,
    motivo: `deploy ${atual.situacao} e site fora do ar em ${FALHAS_SEGUIDAS} batidas seguidas`,
  };
}
