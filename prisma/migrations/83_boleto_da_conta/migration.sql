-- Boleto guardado junto da conta (11/11/2026, vindo do sistema da Advocacia
-- Roma). O documento lido pela IA era descartado depois de preencher valor e
-- vencimento; no dia de pagar, alguem tinha de cacar o PDF.
--
-- Lancamento.arquivoId (ja existia, sem uso) passa a guardar o BOLETO. Entram
-- a linha digitavel, em coluna propria (para copiar sem selecionar errado), e
-- o comprovante, anexado depois da baixa.
ALTER TABLE "Lancamento" ADD COLUMN IF NOT EXISTS "linhaDigitavel" TEXT;
ALTER TABLE "Lancamento" ADD COLUMN IF NOT EXISTS "comprovanteId" TEXT;
DO $$ BEGIN
  ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_comprovanteId_fkey"
    FOREIGN KEY ("comprovanteId") REFERENCES "Arquivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
