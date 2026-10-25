-- Suspensao pelo operador e avisos de cobranca da plataforma (25/10/2026).
--
-- Escritorio ganha a suspensao manual (o operador tira do ar quem esta em
-- atraso antes dos 15 dias da regua), o motivo e a data, e o adiamento: ate
-- quando a regua NAO suspende sozinha (promessa de pagamento combinada).
-- AvisoDeCobranca guarda cada aviso enviado ao escritorio, para nao mandar o
-- mesmo duas vezes e para o operador ver o historico na ficha.
ALTER TABLE "Escritorio" ADD COLUMN IF NOT EXISTS "suspensoEm" TIMESTAMP(3);
ALTER TABLE "Escritorio" ADD COLUMN IF NOT EXISTS "suspensaoManual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Escritorio" ADD COLUMN IF NOT EXISTS "suspensaoMotivo" TEXT;
ALTER TABLE "Escritorio" ADD COLUMN IF NOT EXISTS "suspensaoAdiadaAte" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "AvisoDeCobranca" (
  "id"           TEXT NOT NULL,
  "escritorioId" TEXT NOT NULL,
  "faturaId"     TEXT,
  "tipo"         TEXT NOT NULL,
  "para"         TEXT NOT NULL,
  "enviadoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "porOperador"  TEXT,
  CONSTRAINT "AvisoDeCobranca_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AvisoDeCobranca_escritorioId_enviadoEm_idx" ON "AvisoDeCobranca"("escritorioId", "enviadoEm");
CREATE INDEX IF NOT EXISTS "AvisoDeCobranca_faturaId_tipo_idx" ON "AvisoDeCobranca"("faturaId", "tipo");
DO $$ BEGIN
  ALTER TABLE "AvisoDeCobranca" ADD CONSTRAINT "AvisoDeCobranca_escritorioId_fkey"
    FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AvisoDeCobranca" ADD CONSTRAINT "AvisoDeCobranca_faturaId_fkey"
    FOREIGN KEY ("faturaId") REFERENCES "Fatura"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
