// O dominio da plataforma, em um lugar so.
//
// Existe por causa de um erro que so apareceu em producao: `process.env.X ??
// "padrao"` NAO cai no padrao quando a variavel existe e esta VAZIA — e
// variavel vazia e coisa comum, porque provedor de nuvem cria a chave a
// partir do .env.example e deixa o valor em branco.
//
// O estrago foi discreto: o robots.txt saiu anunciando
// "Sitemap: https:///sitemap.xml", com o dominio no meio faltando. Nada
// quebra, ninguem reclama, e o buscador simplesmente ignora o sitemap.
export const DOMINIO_PADRAO = "birdjud.com.br";

export function dominioDaPlataforma(): string {
  const valor = process.env.DOMINIO_PLATAFORMA?.trim();
  return valor || DOMINIO_PADRAO;
}
