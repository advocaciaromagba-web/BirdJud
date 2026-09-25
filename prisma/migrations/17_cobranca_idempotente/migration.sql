ALTER TABLE "Cobranca" ADD COLUMN "chaveOperacao" TEXT;
CREATE UNIQUE INDEX "Cobranca_chaveOperacao_key" ON "Cobranca"("chaveOperacao");
