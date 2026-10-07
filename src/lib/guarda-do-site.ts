/**
 * O laco que observa o site e manda voltar quando preciso.
 *
 * Mora no trabalhador, que e outro servico: quando a aplicacao cai, ele
 * continua de pe. Nao depende do banco de proposito — se dependesse, uma
 * queda do Postgres levaria junto quem deveria avisar.
 *
 * Limite honesto: roda dentro do mesmo provedor que vigia. Se o Railway
 * inteiro cair, ele cai junto. Cobre o caso comum — deploy ruim — e nao
 * substitui monitor de fora.
 */
import { acessoDoAmbiente, deploysRecentes, voltarPara, type Acesso } from "./railway";
import { FALHAS_SEGUIDAS, decidir, type Volta } from "./volta-de-deploy";

export const INTERVALO_MS = 30_000;

/** Quantas batidas guardar: o minimo para decidir, sem memoria a toa. */
const LEMBRAR = FALHAS_SEGUIDAS;

export type Dependencias = {
  bater: () => Promise<boolean>;
  deploys: () => Promise<Awaited<ReturnType<typeof deploysRecentes>>>;
  voltar: (deployId: string) => Promise<void>;
  anotar?: (linha: string) => void;
  agora?: () => number;
};

/**
 * Uma rodada. Devolve o historico novo e a ultima volta, para a proxima.
 *
 * Separado do setInterval para poder ser testado sem relogio.
 */
export async function rodada(
  deps: Dependencias,
  estado: { saude: boolean[]; ultimaVolta: Volta | null },
): Promise<{ saude: boolean[]; ultimaVolta: Volta | null }> {
  const anotar = deps.anotar ?? ((l: string) => console.log(`guarda: ${l}`));
  const agora = (deps.agora ?? Date.now)();

  const respondeu = await deps.bater().catch(() => false);
  const saude = [...estado.saude, respondeu].slice(-LEMBRAR);

  // Enquanto o site responde, nao se pergunta nada ao Railway. Bater na API
  // a cada trinta segundos sem motivo so gasta cota.
  if (respondeu) return { saude, ultimaVolta: estado.ultimaVolta };

  let deploys;
  try {
    deploys = await deps.deploys();
  } catch (falha) {
    anotar(`nao consegui ler os deploys: ${(falha as Error).message}`);
    return { saude, ultimaVolta: estado.ultimaVolta };
  }

  const decisao = decidir({ saude, deploys, ultimaVolta: estado.ultimaVolta, agora });
  if (decisao.acao === "nada") {
    anotar(`site fora do ar, sem agir: ${decisao.motivo}`);
    return { saude, ultimaVolta: estado.ultimaVolta };
  }

  anotar(`voltando para o deploy ${decisao.alvo.id}: ${decisao.motivo}`);
  try {
    await deps.voltar(decisao.alvo.id);
  } catch (falha) {
    anotar(`a volta falhou: ${(falha as Error).message}`);
    return { saude, ultimaVolta: estado.ultimaVolta };
  }
  anotar(`volta pedida para ${decisao.alvo.id}`);
  // Zera o historico: a partir daqui o que importa e o site depois da volta.
  return { saude: [], ultimaVolta: { paraId: decisao.alvo.id, quando: agora } };
}

async function bateNoSite(endereco: string): Promise<boolean> {
  try {
    const r = await fetch(endereco, { signal: AbortSignal.timeout(15_000) });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Liga o laco. Devolve uma funcao que o desliga, ou null quando a volta
 * automatica nao esta configurada — o que e um estado valido, nao um erro.
 */
export function ligarGuarda(
  ambiente: Record<string, string | undefined> = process.env,
): (() => void) | null {
  let acesso: Acesso | null;
  try {
    acesso = acessoDoAmbiente(ambiente);
  } catch (falha) {
    console.error(`guarda: ${(falha as Error).message}`);
    return null;
  }
  if (!acesso) return null;

  const endereco =
    ambiente.GUARDA_ENDERECO ??
    `https://${ambiente.DOMINIO_PLATAFORMA?.trim() || "birdjud.com.br"}/api/saude`;

  const deps: Dependencias = {
    bater: () => bateNoSite(endereco),
    deploys: () => deploysRecentes(acesso!),
    voltar: (id) => voltarPara(acesso!, id),
  };

  let estado: { saude: boolean[]; ultimaVolta: Volta | null } = {
    saude: [],
    ultimaVolta: null,
  };
  let ocupado = false;

  console.log(`guarda do site no ar, olhando ${endereco} a cada ${INTERVALO_MS / 1000}s.`);
  const relogio = setInterval(() => {
    // Uma rodada lenta nao pode empilhar com a proxima.
    if (ocupado) return;
    ocupado = true;
    rodada(deps, estado)
      .then((novo) => {
        estado = novo;
      })
      .catch((falha) => console.error(`guarda: ${(falha as Error).message}`))
      .finally(() => {
        ocupado = false;
      });
  }, INTERVALO_MS);
  relogio.unref?.();
  return () => clearInterval(relogio);
}
