-- Cliente menor de idade (27/10/2026, vindo do sistema da Advocacia Roma).
--
-- O documento sai no nome do menor, com quem exerce o poder familiar: ate 16
-- anos incompletos "representado" (CC 3o), de 16 a 18 "assistido" (CC 4o, I).
-- Quem representa mora na mesma tabela dos representantes de pessoa
-- juridica, com o parentesco. responsavelClienteId liga o menor ao cadastro
-- do adulto de onde ele nasceu (a mae que chegou como cliente).
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "menor" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "responsavelClienteId" TEXT;
CREATE INDEX IF NOT EXISTS "Cliente_responsavelClienteId_idx" ON "Cliente"("responsavelClienteId");
DO $$ BEGIN
  ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_responsavelClienteId_fkey"
    FOREIGN KEY ("responsavelClienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "Representante" ADD COLUMN IF NOT EXISTS "parentesco" TEXT;
