-- Baixa manual de cobranca, parcial e retroativa (02/11/2026, vindo do sistema
-- da Advocacia Roma).
--
-- O cliente pagou em dinheiro, por transferencia direta, ou pagou parte: cada
-- recebimento fica registrado com a data em que de fato aconteceu, quem deu a
-- baixa e uma observacao. Somando o valor, a cobranca vira PARCIAL ou PAGA.
-- Desfazer apaga a baixa e o lancamento que ela gerou.
CREATE TABLE IF NOT EXISTS "BaixaDeCobranca" (
  "id"            TEXT NOT NULL,
  "escritorioId"  TEXT NOT NULL,
  "cobrancaId"    TEXT NOT NULL,
  "valorCentavos" INTEGER NOT NULL,
  "data"          TIMESTAMP(3) NOT NULL,
  "origem"        TEXT NOT NULL DEFAULT 'MANUAL',
  "observacao"    TEXT,
  "registradoPor" TEXT,
  "lancamentoId"  TEXT,
  "noProvedor"    BOOLEAN NOT NULL DEFAULT false,
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BaixaDeCobranca_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BaixaDeCobranca_escritorioId_cobrancaId_idx" ON "BaixaDeCobranca"("escritorioId", "cobrancaId");
DO $$ BEGIN
  ALTER TABLE "BaixaDeCobranca" ADD CONSTRAINT "BaixaDeCobranca_escritorioId_fkey"
    FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "BaixaDeCobranca" ADD CONSTRAINT "BaixaDeCobranca_cobrancaId_fkey"
    FOREIGN KEY ("cobrancaId") REFERENCES "Cobranca"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
