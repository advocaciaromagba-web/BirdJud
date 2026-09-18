// Limite de tentativas por chave (IP, e-mail), em janela deslizante.
//
// LIMITACAO CONHECIDA: a contagem vive na memoria do processo. Com mais de uma
// instancia, cada uma conta a sua — o limite real vira N vezes o configurado.
// Serve para conter abuso bobo (script repetindo cadastro); protecao de verdade
// contra ataque distribuido e no provedor, antes da aplicacao.
type Janela = { ate: number; tentativas: number };

const janelas = new Map<string, Janela>();

/** Evita que o mapa cresca sem fim em processo de vida longa. */
function limpar(agora: number): void {
  if (janelas.size < 5_000) return;
  for (const [chave, janela] of janelas) {
    if (janela.ate <= agora) janelas.delete(chave);
  }
}

export type ResultadoDoLimite = {
  permitido: boolean;
  restantes: number;
  esperarSegundos: number;
};

export function registrarTentativa(
  chave: string,
  maximo: number,
  janelaSegundos: number,
  agora = Date.now()
): ResultadoDoLimite {
  limpar(agora);

  const atual = janelas.get(chave);
  if (!atual || atual.ate <= agora) {
    janelas.set(chave, { ate: agora + janelaSegundos * 1000, tentativas: 1 });
    return { permitido: true, restantes: maximo - 1, esperarSegundos: 0 };
  }

  atual.tentativas += 1;
  if (atual.tentativas > maximo) {
    return {
      permitido: false,
      restantes: 0,
      esperarSegundos: Math.ceil((atual.ate - agora) / 1000),
    };
  }
  return { permitido: true, restantes: maximo - atual.tentativas, esperarSegundos: 0 };
}

/** So para os testes: zera o estado entre casos. */
export function zerarLimites(): void {
  janelas.clear();
}
