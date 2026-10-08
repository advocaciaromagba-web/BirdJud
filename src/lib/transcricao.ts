/**
 * Transcricao de fala em texto: a parte que e regra, nao navegador.
 *
 * O reconhecimento em si vive no componente, porque depende de API do
 * navegador. O que esta aqui e o que decide COMO o texto se forma — e isso
 * precisa de teste, porque errar junta duas falas numa frase so, ou repete
 * o ultimo trecho a cada pausa.
 *
 * SIGILO, antes de tudo. Por padrao o reconhecimento de voz do Chrome manda
 * o audio para um servidor. O modo no dispositivo existe desde o Chrome 139
 * (ago/2025), mas exige instalar o idioma e nao esta em todo navegador.
 * Numa entrevista de triagem o que se fala e materia de sigilo profissional,
 * entao a regra deste modulo e: LOCAL ou NADA. Sem local disponivel, o
 * sistema diz isso e nao transcreve sozinho — quem decide mandar a conversa
 * para fora e a pessoa que esta na sala, nunca o padrao.
 */

/** Quem estava falando. A entrevista tem dois lados e misturar atrapalha. */
export const LADOS = ["ADVOGADO", "CLIENTE"] as const;
export type Lado = (typeof LADOS)[number];

export const MARCA_DO_LADO: Record<Lado, string> = {
  ADVOGADO: "Advogado:",
  CLIENTE: "Cliente:",
};

/**
 * Em que estado esta o reconhecimento no dispositivo.
 *
 * NAO existe estado "nuvem disponivel" de proposito: a nuvem nao e um modo
 * que o sistema oferece, e uma coisa que a pessoa pede sabendo o que esta
 * fazendo.
 */
export type Disponibilidade =
  | "verificando"
  | "pronto"
  | "precisa-instalar"
  | "sem-suporte";

export const AVISO_DA_DISPONIBILIDADE: Record<Disponibilidade, string> = {
  verificando: "Vendo se este computador consegue transcrever sem internet...",
  pronto: "Transcricao no proprio computador. A conversa nao sai daqui.",
  "precisa-instalar":
    "Falta baixar o portugues para transcrever sem internet. Sao alguns " +
    "minutos, uma vez so, e depois funciona offline.",
  "sem-suporte":
    "Este navegador nao transcreve sem mandar o audio para fora. Use o " +
    "Chrome atualizado, ou digite a anotacao — transcrever pela nuvem " +
    "significa a conversa do cliente sair do escritorio.",
};

/**
 * Junta um trecho reconhecido ao texto que ja existe.
 *
 * Tres coisas que o reconhecimento faz e que estragariam a anotacao:
 *
 * 1. devolve o trecho SEM pontuacao e sem maiuscula. Colar um atras do outro
 *    produz um paragrafo unico de dez minutos;
 * 2. repete o ultimo trecho quando a pessoa pausa e volta a falar;
 * 3. nao sabe quem falou. A troca de lado precisa comecar linha nova, senao
 *    a resposta do cliente vira continuacao da pergunta do advogado.
 */
export function juntarFala(
  textoAtual: string,
  trecho: string,
  lado: Lado,
  ladoAnterior: Lado | null,
): string {
  const limpo = trecho.trim().replace(/\s+/g, " ");
  if (!limpo) return textoAtual;

  const base = textoAtual.trimEnd();

  // Repetido: o mesmo trecho que acabou de entrar nao entra duas vezes.
  if (base.endsWith(limpo)) return textoAtual;

  const frase = limpo[0].toUpperCase() + limpo.slice(1);
  const terminado = /[.!?…]$/.test(frase) ? frase : `${frase}.`;

  // Trocou de lado, ou e o comeco: linha nova com a marca de quem fala.
  if (lado !== ladoAnterior) {
    const marca = MARCA_DO_LADO[lado];
    return base ? `${base}\n\n${marca} ${terminado}` : `${marca} ${terminado}`;
  }
  return base ? `${base} ${terminado}` : terminado;
}

/**
 * Quantos segundos de silencio antes de avisar que ninguem esta sendo ouvido.
 *
 * O erro mais comum nao e a transcricao ruim: e o microfone errado
 * selecionado, e vinte minutos de conversa que nao viraram nada. Avisar em
 * doze segundos custa uma interrupcao; nao avisar custa a entrevista.
 */
export const SEGUNDOS_ATE_AVISAR_SILENCIO = 12;

/** O texto tem conteudo de verdade, ou so marcas de quem fala? */
export function temFala(texto: string): boolean {
  const semMarcas = texto
    .split("\n")
    .map((linha) =>
      linha.replace(/^(Advogado|Cliente):\s*/, "").trim(),
    )
    .join(" ")
    .trim();
  return semMarcas.length > 0;
}
