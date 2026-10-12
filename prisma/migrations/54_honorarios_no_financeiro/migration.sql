-- Parcela de contrato de honorarios prevista no financeiro (a receber).
ALTER TABLE "Lancamento" ADD COLUMN "contratoId" TEXT;
ALTER TABLE "Lancamento" ADD COLUMN "parcelaNumero" INTEGER;
CREATE UNIQUE INDEX "Lancamento_contratoId_parcelaNumero_key" ON "Lancamento"("contratoId", "parcelaNumero");
CREATE INDEX "Lancamento_escritorioId_contratoId_idx" ON "Lancamento"("escritorioId", "contratoId");
