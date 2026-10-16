-- Fatura anual parcelada no cartao (16/10/2026).
--
-- parcelamentoId: o id do parcelamento no Asaas ("installment"). Cada parcela
-- e uma cobranca propria; o webhook acha a fatura por aqui quando o evento de
-- uma parcela chega sem a nossa referencia.
-- parcelas: em quantas vezes ficou. Nulo = cobranca unica (boleto, Pix ou
-- cartao a vista).
ALTER TABLE "Fatura" ADD COLUMN IF NOT EXISTS "parcelamentoId" TEXT;
ALTER TABLE "Fatura" ADD COLUMN IF NOT EXISTS "parcelas" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "Fatura_parcelamentoId_key" ON "Fatura"("parcelamentoId");
