// O 429 que nao e do BirdJud (10/11/2026).
//
// Das 14:25 as 14:45 UTC de 10/11 o vigia recebeu HTTP 429 no endereco
// publico da Railway e mandou "BirdJud fora do ar". Os registros de HTTP da
// aplicacao mostram que nenhuma dessas batidas chegou a ela, e que no mesmo
// minuto outras requisicoes recebiam 200: quem respondeu 429 foi a borda da
// Railway, limitando o IP de saida do vigia (compartilhado com outros
// projetos). Refeito o deploy do vigia, com outro IP, voltou ao normal.
//
// A aplicacao nunca devolve 429 no /api/saude. Entao: se TODAS as tentativas
// falharam so com 429, o vigia confere pela rede interna da Railway antes de
// acusar queda. Respondeu la, nao e queda — e aviso brando, uma vez por hora.
// Qualquer outra falha (5xx, tempo esgotado, rede) segue acusando como antes.

/** Todas as tentativas falharam so por limite da borda (HTTP 429)? */
export function soLimiteDaBorda(motivos: string[]): boolean {
  return motivos.length > 0 && motivos.every((m) => /:\s*HTTP 429$/.test(m));
}

/** O /api/saude pela rede privada da Railway, sem passar pela borda. */
export function enderecoInterno(env: Record<string, string | undefined> = process.env): string {
  return env.VIGIA_ENDERECO_INTERNO?.trim() || `http://${env.APLICACAO_INTERNA?.trim() || "aplicacao.railway.internal"}:8080/api/saude`;
}
