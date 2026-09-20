import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { dataHoraBR } from "@/lib/datas";
import { modulosAtivos } from "@/lib/modulos";
import { Navegacao } from "@/componentes/Navegacao";
import { FormularioCriar } from "@/componentes/FormularioCriar";
import { formatarNumeroProcesso } from "@/lib/leitura-publicacao";

const TIPOS = [
  { valor: "COMPROMISSO", rotulo: "Compromisso" },
  { valor: "AUDIENCIA", rotulo: "Audiencia" },
  { valor: "PRAZO", rotulo: "Prazo" },
  { valor: "TAREFA", rotulo: "Tarefa" },
];

export default async function PaginaAgenda() {
  const contexto = await contextoDaPagina();

  const modulos = await modulosAtivos(contexto.escritorioId);
  const { compromissos, processos } = await comEscritorio(contexto.escritorioId, async (db) => ({
    compromissos: await db.compromisso.findMany({
      where: { inicio: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      orderBy: { inicio: "asc" },
      take: 200,
      include: { processo: { select: { numero: true } } },
    }),
    processos: await db.processo.findMany({ orderBy: { criadoEm: "desc" }, take: 500 }),
  }));

  const formato = dataHoraBR;

  return (
    <>
      <Navegacao nomeEscritorio={contexto.marca.nome} papel={contexto.papel} modulos={modulos} />
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold">Agenda</h1>
        <p className="mt-1 text-sm text-neutral-500">Compromissos de hoje em diante.</p>

        <FormularioCriar
          rota="/api/compromissos"
          campos={[
            { nome: "titulo", rotulo: "Titulo", obrigatorio: true },
            { nome: "inicio", rotulo: "Inicio", tipo: "datetime-local", obrigatorio: true },
            { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: TIPOS },
            {
              nome: "processoId",
              rotulo: "Processo",
              tipo: "select",
              opcoes: processos.map((p) => ({ valor: p.id, rotulo: formatarNumeroProcesso(p.numero) })),
            },
            { nome: "local", rotulo: "Local" },
          ]}
          textoBotao="Agendar"
        />

        {compromissos.length === 0 ? (
          <p className="mt-6 text-neutral-600">Nada agendado.</p>
        ) : (
          <ul className="mt-6 divide-y divide-neutral-200">
            {compromissos.map((compromisso) => (
              <li key={compromisso.id} className="py-3">
                <p className="font-semibold">{compromisso.titulo}</p>
                <p className="text-sm text-neutral-500">
                  {formato.format(compromisso.inicio)} · {compromisso.tipo}
                  {compromisso.processo ? ` · ${formatarNumeroProcesso(compromisso.processo.numero)}` : ""}
                  {compromisso.local ? ` · ${compromisso.local}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
