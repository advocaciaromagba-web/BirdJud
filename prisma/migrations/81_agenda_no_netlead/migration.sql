-- Bloqueio dos horarios da agenda no NetLead (04/11/2026, vindo do sistema da
-- Advocacia Roma). Uma linha por pessoa que ligou. Tabela propria, e nao
-- colunas no Usuario, para a chave cifrada nunca vir junto numa consulta que
-- devolve o usuario inteiro.
CREATE TABLE IF NOT EXISTS "AgendaNoNetlead" (
  "id"           TEXT NOT NULL,
  "escritorioId" TEXT NOT NULL,
  "usuarioId"    TEXT NOT NULL,
  "chave"        BYTEA NOT NULL,
  "chaveFinal"   TEXT NOT NULL,
  "ativo"        BOOLEAN NOT NULL DEFAULT false,
  "pessoa"       TEXT,
  "erro"         TEXT,
  "enviadoEm"    TIMESTAMP(3),
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgendaNoNetlead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AgendaNoNetlead_usuarioId_key" ON "AgendaNoNetlead"("usuarioId");
CREATE INDEX IF NOT EXISTS "AgendaNoNetlead_escritorioId_idx" ON "AgendaNoNetlead"("escritorioId");
DO $$ BEGIN
  ALTER TABLE "AgendaNoNetlead" ADD CONSTRAINT "AgendaNoNetlead_escritorioId_fkey"
    FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AgendaNoNetlead" ADD CONSTRAINT "AgendaNoNetlead_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
