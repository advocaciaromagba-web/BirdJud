-- Solucao da tarefa (29/10/2026, vindo do sistema da Advocacia Roma).
--
-- O que foi feito para resolver: quem foi avisado, o que foi protocolado,
-- como a publicacao foi tratada. Com autor e data: "foi protocolado" sem
-- quem nem quando nao responde a pergunta que alguem vai fazer meses depois.
ALTER TABLE "Tarefa" ADD COLUMN IF NOT EXISTS "solucao" TEXT;
ALTER TABLE "Tarefa" ADD COLUMN IF NOT EXISTS "solucaoEm" TIMESTAMP(3);
ALTER TABLE "Tarefa" ADD COLUMN IF NOT EXISTS "solucaoPorId" TEXT;
DO $$ BEGIN
  ALTER TABLE "Tarefa" ADD CONSTRAINT "Tarefa_solucaoPorId_fkey"
    FOREIGN KEY ("solucaoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
