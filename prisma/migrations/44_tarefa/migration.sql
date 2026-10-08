-- Tarefa do dia a dia, e meta da equipe.
--
-- NAO e Prazo: prazo judicial exige termo inicial, dias e contagem, e a data
-- sai de conta com o calendario forense. "Ligar para o cliente" nao cabe ali
-- sem inventar uma intimacao que nunca houve.
--
-- responsavelId e NOT NULL de proposito: tarefa sem dono nao e feita.
CREATE TABLE "Tarefa" (
  "id"             TEXT NOT NULL,
  "escritorioId"   TEXT NOT NULL,
  "titulo"         TEXT NOT NULL,
  "descricao"      TEXT,
  "vencimento"     TIMESTAMP(3) NOT NULL,
  "prioridade"     TEXT NOT NULL DEFAULT 'MEDIA',
  "situacao"       TEXT NOT NULL DEFAULT 'PENDENTE',
  "meta"           BOOLEAN NOT NULL DEFAULT false,
  "processoId"     TEXT,
  "numeroProcesso" TEXT,
  "clienteId"      TEXT,
  "responsavelId"  TEXT NOT NULL,
  "criadoPorId"    TEXT,
  "concluidaEm"    TIMESTAMP(3),
  "criadaEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadaEm"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Tarefa_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Tarefa_escritorioId_situacao_vencimento_idx"
  ON "Tarefa"("escritorioId", "situacao", "vencimento");
CREATE INDEX "Tarefa_escritorioId_responsavelId_idx"
  ON "Tarefa"("escritorioId", "responsavelId");

ALTER TABLE "Tarefa" ADD CONSTRAINT "Tarefa_escritorioId_fkey"
  FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Tarefa" ADD CONSTRAINT "Tarefa_processoId_fkey"
  FOREIGN KEY ("processoId") REFERENCES "Processo"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Tarefa" ADD CONSTRAINT "Tarefa_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CASCADE no responsavel: usuario removido leva as tarefas dele. Deixar
-- tarefa orfa com responsavelId apontando para ninguem seria pior — ela
-- sumiria de toda lista filtrada por responsavel e nunca mais seria feita.
ALTER TABLE "Tarefa" ADD CONSTRAINT "Tarefa_responsavelId_fkey"
  FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
