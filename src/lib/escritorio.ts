// Marca e configuracao do escritorio — o que, em sistemas de escritorio unico,
// fica fixo no codigo (nome, telefone, cidade, endereco, cores, expediente).
//
// A resolucao do subdominio acontece ANTES de existir sessao, quando ainda nao
// ha escritorio no contexto. Por isso ela nao usa o cliente Prisma com a trava
// de escritorio: le a view "EscritorioPublico" (prisma/rls.sql), que expoe so
// as colunas de marca e nenhuma de negocio.
import { prismaPlataforma } from "./prisma";

export type Marca = {
  id: string | null;
  slug: string | null;
  nome: string;
  status: string | null;
  logoUrl: string | null;
  corPrimaria: string;
  corSecundaria: string;
  telefoneAtendimento: string | null;
  cidade: string | null;
};

export const MARCA_NEUTRA: Marca = {
  id: null,
  slug: null,
  nome: "BirdJud",
  status: null,
  logoUrl: null,
  corPrimaria: "#0E6B66",
  corSecundaria: "#16202A",
  telefoneAtendimento: null,
  cidade: null,
};

type LinhaPublica = Omit<Marca, "corPrimaria" | "corSecundaria"> & {
  corPrimaria: string | null;
  corSecundaria: string | null;
};

function paraMarca(linha: LinhaPublica | undefined): Marca | null {
  if (!linha) return null;
  return {
    ...linha,
    corPrimaria: linha.corPrimaria ?? MARCA_NEUTRA.corPrimaria,
    corSecundaria: linha.corSecundaria ?? MARCA_NEUTRA.corSecundaria,
  };
}

/** Resolve o slug a partir do host: <slug>.birdjud.com.br */
export function slugDoHost(host: string | null): string | null {
  if (!host) return null;
  const dominio = (process.env.DOMINIO_PLATAFORMA ?? "birdjud.com.br").toLowerCase();
  const semPorta = host.split(":")[0]?.toLowerCase() ?? "";
  if (!semPorta.endsWith(`.${dominio}`)) return null;
  const slug = semPorta.slice(0, -(dominio.length + 1));
  return slug && slug !== "www" ? slug : null;
}

export async function escritorioPorSlug(slug: string): Promise<Marca | null> {
  const linhas = await prismaPlataforma.$queryRaw<LinhaPublica[]>`
    SELECT "id", "slug", "nome", "status", "logoUrl", "corPrimaria", "corSecundaria",
           "telefoneAtendimento", "cidade"
    FROM "EscritorioPublico" WHERE "slug" = ${slug} LIMIT 1
  `;
  return paraMarca(linhas[0]);
}

/** Marca para a casca da aplicacao. Sem escritorio, devolve a marca neutra. */
export async function marcaDoEscritorio(escritorioId: string | null): Promise<Marca> {
  if (!escritorioId) return MARCA_NEUTRA;
  const linhas = await prismaPlataforma.$queryRaw<LinhaPublica[]>`
    SELECT "id", "slug", "nome", "status", "logoUrl", "corPrimaria", "corSecundaria",
           "telefoneAtendimento", "cidade"
    FROM "EscritorioPublico" WHERE "id" = ${escritorioId} LIMIT 1
  `;
  return paraMarca(linhas[0]) ?? MARCA_NEUTRA;
}
