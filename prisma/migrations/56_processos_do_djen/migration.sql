-- Processos cadastrados a partir do DJEN (OABs do escritorio).
ALTER TABLE "OabMonitorada" ADD COLUMN "processosImportadosEm" TIMESTAMP(3);
ALTER TABLE "Processo" ADD COLUMN "origem" TEXT;
ALTER TABLE "Processo" ADD COLUMN "classe" TEXT;
ALTER TABLE "Processo" ADD COLUMN "partes" JSONB;
ALTER TABLE "Publicacao" ADD COLUMN "partes" JSONB;
ALTER TABLE "Publicacao" ADD COLUMN "segredo" BOOLEAN NOT NULL DEFAULT false;
