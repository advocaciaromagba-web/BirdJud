-- Cupons de desconto, isencao por prazo e reajuste dos contratos (23/10/2026).
--
-- Cupom: codigo unico, desconto em percentual OU valor fixo por mes, por N
-- meses (nulo = enquanto durar a assinatura), com validade e limite de usos.
-- Assinatura ganha o cupom aplicado e ate quando ele vale, o fim da
-- cortesia (nulo = sem prazo, como era) e a data do ultimo reajuste.
CREATE TABLE IF NOT EXISTS "Cupom" (
  "id"            TEXT NOT NULL,
  "codigo"        TEXT NOT NULL,
  "descricao"     TEXT,
  "percentual"    INTEGER,
  "valorCentavos" INTEGER,
  "meses"         INTEGER,
  "validoAte"     TIMESTAMP(3),
  "maxUsos"       INTEGER,
  "usos"          INTEGER NOT NULL DEFAULT 0,
  "ativo"         BOOLEAN NOT NULL DEFAULT true,
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "criadoPor"     TEXT,
  CONSTRAINT "Cupom_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Cupom_um_desconto" CHECK (("percentual" IS NULL) <> ("valorCentavos" IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS "Cupom_codigo_key" ON "Cupom"("codigo");

ALTER TABLE "Assinatura" ADD COLUMN IF NOT EXISTS "cortesiaAte" TIMESTAMP(3);
ALTER TABLE "Assinatura" ADD COLUMN IF NOT EXISTS "cupomId" TEXT;
ALTER TABLE "Assinatura" ADD COLUMN IF NOT EXISTS "cupomAte" TIMESTAMP(3);
ALTER TABLE "Assinatura" ADD COLUMN IF NOT EXISTS "cupomAplicadoEm" TIMESTAMP(3);
ALTER TABLE "Assinatura" ADD COLUMN IF NOT EXISTS "reajustadoEm" TIMESTAMP(3);
DO $$ BEGIN
  ALTER TABLE "Assinatura" ADD CONSTRAINT "Assinatura_cupomId_fkey"
    FOREIGN KEY ("cupomId") REFERENCES "Cupom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
