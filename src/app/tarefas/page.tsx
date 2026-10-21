import { diaEmBrasilia } from "@/lib/datas";
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
    prazoFatalDia: t.prazoFatal ? diaEmBrasilia(t.prazoFatal) : null,
    prioridade: t.prioridade as Prioridade,
    situacao: t.situacao,
    meta: t.meta,
    numeroProcesso: t.numeroProcesso,
    clienteId: t.clienteId,
    nomeDoCliente: t.cliente?.nome ?? null,
    responsavelId: t.responsavelId,
    nomeDoResponsavel: t.responsavel?.nome ?? "—",
    atrasada: estaAtrasada(t, agora),
    anexos: t.anexos,
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
      chamada="Peças, manifestações, recursos e metas da equipe. Audiência, perícia e atendimento ficam na Agenda."
    >
      <PainelTarefas
        tarefas={naTela}
        equipe={equipe}
        clientes={clientes}
        ativas={contagem.ativas}
        concluidas={contagem.concluidas}
        mostrandoConcluidas={concluidas}
        temIA={modulos.includes("IA")}
        temNuvem={modulos.includes("NUVEM")}
      />
    </Estrutura>
  );
}
