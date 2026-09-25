// Endereco -> escritorio. Usado pelo middleware (runtime edge) e pelo servidor,
// por isso nao importa Prisma nem nada de Node: so string.
export const CABECALHO_SLUG = "x-escritorio-slug";

/** Subdominios da propria plataforma, que nao sao escritorio. */
const RESERVADOS = new Set(["www", "app", "api", "admin", "painel"]);

/** Extrai o slug de <slug>.birdjud.com.br. Devolve null quando nao ha. */
export function slugDoHost(host: string | null): string | null {
  if (!host) return null;
  // Variavel vazia nao cai no padrao com ??, e provedor de nuvem cria chave
  // vazia com facilidade: por isso o trim antes do ||.
  const dominio = (
    process.env.DOMINIO_PLATAFORMA?.trim() || "birdjud.com.br"
  ).toLowerCase();
  const semPorta = host.split(":")[0]?.toLowerCase() ?? "";
  if (!semPorta.endsWith(`.${dominio}`)) return null;
  const slug = semPorta.slice(0, -(dominio.length + 1));
  if (!slug || slug.includes(".")) return null; // nada de niveis extras
  return RESERVADOS.has(slug) ? null : slug;
}
