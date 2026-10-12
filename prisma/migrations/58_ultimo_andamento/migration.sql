-- Ultimo andamento do processo, vindo do DJEN.
ALTER TABLE "Processo" ADD COLUMN "ultimoAndamentoEm" TIMESTAMP(3);
ALTER TABLE "Processo" ADD COLUMN "ultimoAndamentoTipo" TEXT;
ALTER TABLE "Processo" ADD COLUMN "ultimoAndamentoTexto" TEXT;
CREATE INDEX "Processo_escritorioId_ultimoAndamentoEm_idx" ON "Processo"("escritorioId", "ultimoAndamentoEm");
