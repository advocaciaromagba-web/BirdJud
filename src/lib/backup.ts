// Backup e restauracao POR ESCRITORIO.
//
// Diferente da exportacao (src/lib/exportacao.ts), que e para o cliente levar
// os dados embora e por isso nao leva segredo nenhum, o backup e operacional:
// precisa ser restauravel, entao carrega tambem as credenciais de integracao
// — cifradas. Sem a SEGREDO_CHAVE do ambiente, um arquivo desses nao entrega
// credencial nenhuma; ainda assim, ele e material sensivel.
import { randomUUID } from "node:crypto";
import { prismaPlataforma } from "./prisma";

export const FORMATO_DO_BACKUP = 1;

export type Backup = {
  formato: number;
  geradoEm: string;
  escritorio: Record<string, unknown>;
  tabelas: Record<string, unknown[]>;
};

/** Ordem importa na restauracao: pai antes de filho. */
const TABELAS = [
  "usuario",
  "cliente",
  "processo",
  "compromisso",
  "lancamento",
  "moduloContratado",
  "integracao",
  "consumoMensal",
  "assinatura",
  "fatura",
  "aceiteDeTermos",
] as const;

export async function gerarBackup(escritorioId: string): Promise<Backup> {
  const db = prismaPlataforma();

  const escritorio = await db.escritorio.findUniqueOrThrow({
    where: { id: escritorioId },
  });

  const tabelas: Record<string, unknown[]> = {};
  for (const tabela of TABELAS) {
    // O cliente do plano de controle atravessa o RLS: o backup precisa ver
    // tudo do escritorio, inclusive o que nenhuma sessao veria.
    const modelo = db[tabela] as unknown as {
      findMany: (args: unknown) => Promise<unknown[]>;
    };
    tabelas[tabela] = await modelo.findMany({ where: { escritorioId } });
  }

  return {
    formato: FORMATO_DO_BACKUP,
    geradoEm: new Date().toISOString(),
    escritorio,
    tabelas,
  };
}

export type ResultadoDaRestauracao = {
  escritorioId: string;
  slug: string;
  registros: Record<string, number>;
};

/**
 * Restaura o backup como um escritorio NOVO.
 *
 * Nunca por cima do original, de proposito: restaurar por cima e como se
 * testa backup uma vez so, no dia em que se perde o que sobrou. Com escritorio
 * novo, o mesmo comando serve para o teste periodico e para o resgate de
 * verdade — e o de verdade termina com uma troca de slug, decisao humana.
 */
export async function restaurarBackup(
  backup: Backup,
  slugNovo: string,
): Promise<ResultadoDaRestauracao> {
  if (backup.formato !== FORMATO_DO_BACKUP) {
    throw new Error(`Formato de backup nao suportado: ${backup.formato}`);
  }

  const db = prismaPlataforma();
  const original = backup.escritorio as Record<string, unknown>;

  const novo = await db.escritorio.create({
    data: {
      slug: slugNovo,
      nome: String(original.nome ?? "Escritorio restaurado"),
      cnpj: (original.cnpj as string | null) ?? null,
      // Restauracao nasce suspensa: quem decide reabrir o acesso e gente, nao
      // o script. Evita duas copias do mesmo escritorio no ar por engano.
      status: "SUSPENSO",
      faixa: String(original.faixa ?? "ATE_3"),
      logoUrl: (original.logoUrl as string | null) ?? null,
      corPrimaria: (original.corPrimaria as string | null) ?? null,
      corSecundaria: (original.corSecundaria as string | null) ?? null,
      telefoneAtendimento:
        (original.telefoneAtendimento as string | null) ?? null,
      cidade: (original.cidade as string | null) ?? null,
      enderecos: (original.enderecos as never) ?? undefined,
      expediente: (original.expediente as never) ?? undefined,
    },
  });

  // Ids novos, com as referencias internas remapeadas.
  //
  // Manter os ids originais so funcionaria restaurando em um banco vazio — e
  // a restauracao que interessa e justamente a que roda ao lado do original,
  // para testar o procedimento sem risco.
  const idNovo = new Map<string, string>();
  for (const tabela of TABELAS) {
    for (const linha of (backup.tabelas[tabela] ?? []) as Record<
      string,
      unknown
    >[]) {
      if (typeof linha.id === "string") idNovo.set(linha.id, randomUUID());
    }
  }

  const registros: Record<string, number> = {};

  for (const tabela of TABELAS) {
    const linhas = (backup.tabelas[tabela] ?? []) as Record<string, unknown>[];
    if (linhas.length === 0) {
      registros[tabela] = 0;
      continue;
    }

    const modelo = db[tabela] as unknown as {
      createMany: (args: unknown) => Promise<{ count: number }>;
    };
    const { count } = await modelo.createMany({
      data: linhas.map((linha) => remapear(linha, idNovo, novo.id, tabela)),
    });
    registros[tabela] = count;
  }

  return { escritorioId: novo.id, slug: novo.slug, registros };
}

/**
 * Troca ids e chaves estrangeiras pelos novos.
 *
 * Qualquer campo terminado em "Id" que aponte para um registro do backup e
 * remapeado — e como processo -> cliente e compromisso -> processo continuam
 * ligados depois da restauracao.
 */
function remapear(
  linha: Record<string, unknown>,
  idNovo: Map<string, string>,
  escritorioId: string,
  tabela: string,
): Record<string, unknown> {
  const saida: Record<string, unknown> = {};

  for (const [campo, valor] of Object.entries(linha)) {
    if (campo === "escritorioId") {
      saida[campo] = escritorioId;
      continue;
    }
    if (campo === "id" && typeof valor === "string") {
      saida[campo] = idNovo.get(valor) ?? randomUUID();
      continue;
    }
    if (
      campo.endsWith("Id") &&
      typeof valor === "string" &&
      idNovo.has(valor)
    ) {
      saida[campo] = idNovo.get(valor);
      continue;
    }
    saida[campo] = valor;
  }

  // Bytes vira {type:"Buffer",data:[...]} no JSON: volta a Buffer aqui.
  if (tabela === "integracao") saida.dados = paraBuffer(saida.dados);

  return saida;
}

function paraBuffer(valor: unknown): Buffer {
  if (Buffer.isBuffer(valor)) return valor;
  if (valor && typeof valor === "object" && "data" in valor) {
    return Buffer.from((valor as { data: number[] }).data);
  }
  if (typeof valor === "string") return Buffer.from(valor, "base64");
  throw new Error("Credencial do backup em formato inesperado.");
}
