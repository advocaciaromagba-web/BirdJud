-- Entrevista nao e so a triagem do primeiro atendimento.
--
-- TRIAGEM: a primeira conversa com quem procurou o escritorio (o de sempre).
-- TESTEMUNHA: oitiva de testemunha, para entender o caso.
-- COLETA: coleta de informacoes para gerar um documento.
--
-- processoId liga a entrevista ao processo de que ela trata: o roteiro de
-- perguntas usa a classe, as partes e o ultimo andamento.
ALTER TABLE "Entrevista" ADD COLUMN IF NOT EXISTS "tipo" TEXT NOT NULL DEFAULT 'TRIAGEM';
ALTER TABLE "Entrevista" ADD COLUMN IF NOT EXISTS "processoId" TEXT;
DO $$ BEGIN
  ALTER TABLE "Entrevista" ADD CONSTRAINT "Entrevista_processoId_fkey"
    FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "Entrevista_processoId_idx" ON "Entrevista"("processoId");
