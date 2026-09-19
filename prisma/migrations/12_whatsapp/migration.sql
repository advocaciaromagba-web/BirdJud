-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN "telefone" TEXT,
                      ADD COLUMN "recebeWhatsapp" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Aviso" ADD COLUMN "modelo" TEXT,
                    ADD COLUMN "parametros" JSONB;
