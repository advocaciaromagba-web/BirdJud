// Repetir com espera crescente.
//
// Existe por um motivo especifico: o comando de partida do container roda
// tres operacoes de banco ANTES de ligar o servidor. Com tentativa unica,
// um Postgres que demora dois segundos a mais para aceitar conexao —
// reinicio do banco, manutencao do provedor, rede engasgada — derruba o
// site inteiro, porque o "exec next start" nunca acontece.
//
// A conta das esperas: 1s, 2s, 4s, 8s, 16s — somam 31s. Seis tentativas
// cobrem pouco mais de meio minuto de banco indisponivel, que e a janela
// tipica de um reinicio. Falha de verdade — migracao quebrada, senha
// errada — falha nas seis e continua falhando, que e o que tem de
// acontecer. (O numero de esperas e um a menos que o de tentativas: depois
// da ultima nao se espera por nada.)

export const PADRAO = { tentativas: 6, esperaMs: 1_000, fator: 2 };

export function esperasDe({
  tentativas = PADRAO.tentativas,
  esperaMs = PADRAO.esperaMs,
  fator = PADRAO.fator,
} = {}) {
  // Uma espera a menos que o numero de tentativas: depois da ultima nao se
  // espera por nada.
  const esperas = [];
  for (let i = 0; i < tentativas - 1; i += 1) {
    esperas.push(esperaMs * fator ** i);
  }
  return esperas;
}

const dormir = (ms) => new Promise((pronto) => setTimeout(pronto, ms));

/**
 * Roda `acao` ate dar certo. Devolve o que ela devolveu.
 *
 * `rotulo` aparece no log de cada nova tentativa — sem ele, um deploy que
 * demorou meio minuto a mais nao conta a ninguem o porque.
 */
export async function tentar(acao, { rotulo = "operacao", ...opcoes } = {}) {
  const esperas = esperasDe(opcoes);
  for (let vez = 0; ; vez += 1) {
    try {
      return await acao(vez);
    } catch (falha) {
      if (vez >= esperas.length) throw falha;
      const espera = esperas[vez];
      console.warn(
        `${rotulo}: tentativa ${vez + 1} falhou (${falha.message}); ` +
          `repetindo em ${espera / 1000}s`,
      );
      await dormir(espera);
    }
  }
}
