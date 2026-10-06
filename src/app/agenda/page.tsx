import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { diaEmBrasilia, diaPorExtensoBR, horaBR } from "@/lib/datas";
import { modulosAtivos } from "@/lib/modulos";
import { Estrutura } from "@/componentes/Estrutura";
import { ParticipantesDoCompromisso } from "@/componentes/ParticipantesDoCompromisso";
import { FormularioCriar } from "@/componentes/FormularioCriar";
import { formatarNumeroProcesso } from "@/lib/leitura-publicacao";

const TIPOS = [
  { valor: "COMPROMISSO", rotulo: "Compromisso" },
  { valor: "AUDIENCIA", rotulo: "Audiencia" },
  { valor: "PRAZO", rotulo: "Prazo" },
  { valor: "TAREFA", rotulo: "Tarefa" },
];

const ETIQUETA_DO_TIPO: Record<string, string> = {
  PRAZO: "etiqueta-erro",
  AUDIENCIA: "etiqueta-atencao",
  TAREFA: "etiqueta-neutra",
  COMPROMISSO: "etiqueta-marca",
};

export default async function PaginaAgenda() {
  const contexto = await contextoDaPagina();

  const modulos = await modulosAtivos(contexto.escritorioId);
  const { compromissos, processos, clientes } = await comEscritorio(
    contexto.escritorioId,
    async (db) => ({
      compromissos: await db.compromisso.findMany({
        where: { inicio: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        orderBy: { inicio: "asc" },
        take: 200,
        include: {
          processo: { select: { numero: true } },
          cliente: { select: { nome: true } },
          participantes: {
            orderBy: { criadoEm: "asc" },
            include: { cliente: { select: { nome: true, telefone: true, email: true } } },
          },
        },
      }),
      processos: await db.processo.findMany({
        orderBy: { criadoEm: "desc" },
        take: 500,
      }),
      clientes: await db.cliente.findMany({
        orderBy: { nome: "asc" },
        take: 500,
        select: { id: true, nome: true },
      }),
    }),
  );

  // Agrupado por dia: a agenda de quem advoga se le por dia, nao por lista
  // continua de horarios.
  const dias = new Map<string, typeof compromissos>();
  for (const compromisso of compromissos) {
    const dia = diaEmBrasilia(compromisso.inicio);
    const lista = dias.get(dia) ?? [];
    lista.push(compromisso);
    dias.set(dia, lista);
  }
  const hoje = diaEmBrasilia(new Date());

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      modulos={modulos}
      titulo="Agenda"
      chamada="Compromissos de hoje em diante, agrupados por dia."
    >
      <FormularioCriar
        rota="/api/compromissos"
        recolhivel
        textoAbrir="Novo compromisso"
        textoBotao="Agendar"
        leitura={modulos.includes("IA") ? "AGENDA" : undefined}
        campos={[
          { nome: "titulo", rotulo: "Titulo", obrigatorio: true, largo: true },
          {
            nome: "inicio",
            rotulo: "Inicio",
            tipo: "datetime-local",
            obrigatorio: true,
          },
          { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: TIPOS },
          {
            nome: "clienteId",
            rotulo: "Cliente",
            tipo: "cliente",
            largo: true,
            opcoes: clientes.map((c) => ({ valor: c.id, rotulo: c.nome })),
            ajuda:
              "Obrigatorio na tarefa. No agendamento e opcional — a primeira reuniao pode ser com quem ainda nao e cliente.",
          },
          {
            nome: "processoId",
            rotulo: "Processo",
            tipo: "select",
            opcoes: processos.map((p) => ({
              valor: p.id,
              rotulo: formatarNumeroProcesso(p.numero),
            })),
            ajuda: "Opcional. Agendamento nao precisa de processo.",
          },
          { nome: "local", rotulo: "Local" },
          {
            nome: "observacoes",
            rotulo: "Observacoes",
            tipo: "textarea",
          },
        ]}
      />

      {compromissos.length === 0 ? (
        <p className="vazio mt-6">
          Nada agendado. Prazo, audiencia e tarefa lancados aqui aparecem no
          painel nas 48 horas anteriores.
        </p>
      ) : (
        <div className="mt-6 grid gap-4">
          {[...dias.entries()].map(([dia, doDia]) => (
            <section key={dia} className="cartao">
              <h2 className="flex items-baseline gap-2">
                {dia === hoje ? (
                  <span className="etiqueta-marca">hoje</span>
                ) : null}
                {diaPorExtensoBR.format(doDia[0].inicio)}
              </h2>
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {doDia.map((compromisso) => (
                  <li
                    key={compromisso.id}
                    className="flex flex-wrap items-baseline gap-x-3 py-2.5"
                  >
                    <span className="w-14 shrink-0 font-medium tabular-nums text-slate-900">
                      {horaBR.format(compromisso.inicio)}
                    </span>
                    <span
                      className={
                        ETIQUETA_DO_TIPO[compromisso.tipo] ?? "etiqueta-neutra"
                      }
                    >
                      {compromisso.tipo.toLowerCase()}
                    </span>
                    <span className="font-semibold">{compromisso.titulo}</span>
                    <span className="text-slate-500">
                      {[
                        compromisso.cliente?.nome,
                        compromisso.processo
                          ? formatarNumeroProcesso(compromisso.processo.numero)
                          : null,
                        compromisso.local,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <div className="w-full">
                      <ParticipantesDoCompromisso
                        compromissoId={compromisso.id}
                        titulo={compromisso.titulo}
                        clientes={clientes}
                        comWhatsapp={modulos.includes("WHATSAPP")}
                        iniciais={compromisso.participantes.map((p) => ({
                          clienteId: p.clienteId,
                          // O nome do cliente vem do cadastro, sempre.
                          nome: p.clienteId ? "" : (p.nome ?? ""),
                          telefone: p.telefone ?? "",
                          email: p.email ?? "",
                          papel: p.papel ?? "",
                          avisar: p.avisar,
                        }))}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Estrutura>
  );
}
