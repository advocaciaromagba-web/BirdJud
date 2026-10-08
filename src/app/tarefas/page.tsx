import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { comEscritorio } from "@/lib/prisma";
import {
  contarTarefas,
  tarefasDoEscritorio,
} from "@/lib/tarefas-do-escritorio";
import { estaAtrasada, ordenarAtivas, type Prioridade } from "@/lib/tarefas";
import { Estrutura } from "@/componentes/Estrutura";
import { PainelTarefas, type TarefaNaTela } from "@/componentes/PainelTarefas";

export default async function PaginaTarefas({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const { aba } = await searchParams;
  const concluidas = aba === "concluidas";

  const contexto = await contextoDaPagina(undefined, "TAREFAS");
  const modulos = await modulosAtivos(contexto.escritorioId);
  const [lista, contagem, equipe, clientes] = await Promise.all([
    tarefasDoEscritorio(contexto.escritorioId, concluidas),
    contarTarefas(contexto.escritorioId),
    comEscritorio(contexto.escritorioId, (db) =>
      db.usuario.findMany({
        where: { ativo: true },
        select: { id: true, nome: true },
        orderBy: { nome: "asc" },
      }),
    ),
    comEscritorio(contexto.escritorioId, (db) =>
      db.cliente.findMany({
        select: { id: true, nome: true },
        orderBy: { nome: "asc" },
        take: 500,
      }),
    ),
  ]);

  const agora = new Date();
  const ordenadas = concluidas ? lista : ordenarAtivas(lista, agora);

  const naTela: TarefaNaTela[] = ordenadas.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    descricao: t.descricao,
    vencimentoISO: t.vencimento.toISOString(),
    prioridade: t.prioridade as Prioridade,
    situacao: t.situacao,
    meta: t.meta,
    numeroProcesso: t.numeroProcesso,
    clienteId: t.clienteId,
    nomeDoCliente: t.cliente?.nome ?? null,
    responsavelId: t.responsavelId,
    nomeDoResponsavel: t.responsavel?.nome ?? "—",
    atrasada: estaAtrasada(t, agora),
  }));

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      nomeUsuario={contexto.nomeUsuario}
      acesso={contexto.acesso}
      modulos={modulos}
      titulo="Tarefas e metas"
      chamada="Tarefas do dia a dia e metas da equipe."
    >
      <PainelTarefas
        tarefas={naTela}
        equipe={equipe}
        clientes={clientes}
        ativas={contagem.ativas}
        concluidas={contagem.concluidas}
        mostrandoConcluidas={concluidas}
      />
    </Estrutura>
  );
}
