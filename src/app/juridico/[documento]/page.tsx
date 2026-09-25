import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { DOCUMENTOS, VERSAO_DOS_DOCUMENTOS } from "@/lib/juridico";

/** Documentos publicos, servidos do repositorio — a fonte e uma so. */
const PUBLICOS = new Map<string, string>([
  ...DOCUMENTOS.map((d) => [d.caminho, d.rotulo] as [string, string]),
  ["SLA", "Nivel de servico (SLA)"],
  ["POLITICA-DE-PRIVACIDADE", "Politica de privacidade"],
]);

export function generateStaticParams() {
  return [...PUBLICOS.keys()].map((documento) => ({ documento }));
}

export default async function PaginaDocumento({
  params,
}: {
  params: Promise<{ documento: string }>;
}) {
  const { documento } = await params;
  const rotulo = PUBLICOS.get(documento);
  if (!rotulo) notFound();

  let texto: string;
  try {
    texto = await readFile(
      join(process.cwd(), "docs", "juridico", `${documento}.md`),
      "utf8",
    );
  } catch {
    notFound();
  }

  // Markdown simples, sem biblioteca: estes documentos usam so titulo,
  // paragrafo, lista e tabela, e uma dependencia a mais aqui nao se paga.
  const linhas = texto.split("\n");

  return (
    <main className="mx-auto max-w-3xl p-8">
      <p className="text-sm uppercase tracking-wide text-marca">BirdJud</p>
      <p className="mt-1 text-xs text-slate-500">
        Versao {VERSAO_DOS_DOCUMENTOS}
      </p>
      <article className="mt-6 space-y-3 text-[15px] leading-relaxed">
        {linhas.map((linha, indice) => {
          const chave = `${indice}`;
          if (linha.startsWith("# ")) {
            return (
              <h1 key={chave} className="text-2xl font-bold">
                {linha.slice(2)}
              </h1>
            );
          }
          if (linha.startsWith("## ")) {
            return (
              <h2 key={chave} className="pt-3 text-lg font-bold">
                {linha.slice(3)}
              </h2>
            );
          }
          if (linha.startsWith("> ")) {
            return (
              <p
                key={chave}
                className="border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm"
              >
                {linha.slice(2)}
              </p>
            );
          }
          if (linha.startsWith("- ")) {
            return (
              <p key={chave} className="pl-5 text-slate-800">
                • {linha.slice(2)}
              </p>
            );
          }
          if (linha.startsWith("|")) {
            return (
              <p key={chave} className="font-mono text-xs text-slate-700">
                {linha}
              </p>
            );
          }
          if (!linha.trim()) return null;
          return (
            <p key={chave} className="text-slate-800">
              {linha}
            </p>
          );
        })}
      </article>
    </main>
  );
}
