-- Agenda e tarefas separadas: o prazo passa a morar na tarefa.
ALTER TABLE "Tarefa" ADD COLUMN "prazoFatal" TIMESTAMP(3);
ALTER TABLE "TriagemDePublicacao" ADD COLUMN "tarefaId" TEXT;
ALTER TABLE "Prazo" ADD COLUMN "tarefaId" TEXT;
-- A mudanca dos dados antigos (tarefa e prazo que estavam na agenda e na
-- tela de Prazos) e feita pela rotina separarAgendaETarefas, por escritorio:
-- com RLS forcado, um UPDATE aqui nao enxergaria linha nenhuma.
