-- Anexos de tarefa (21/10/2026): o arquivo passa a poder pertencer a uma
-- tarefa (a intimacao lida, o comprovante do protocolo). Continua na mesma
-- tabela, com as mesmas regras de tipo, espaco e isolamento.
ALTER TABLE "Arquivo" ADD COLUMN IF NOT EXISTS "tarefaId" TEXT;
ALTER TABLE "Arquivo" ADD CONSTRAINT "Arquivo_tarefaId_fkey"
  FOREIGN KEY ("tarefaId") REFERENCES "Tarefa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Arquivo_escritorioId_tarefaId_idx" ON "Arquivo"("escritorioId", "tarefaId");
