-- AlterTable
ALTER TABLE "Escritorio" ADD COLUMN     "encerradoEm" TIMESTAMP(3),
ADD COLUMN     "purgadoEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AceiteDeTermos" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "usuarioEmail" TEXT NOT NULL,
    "usuarioNome" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "versao" TEXT NOT NULL,
    "ip" TEXT,
    "navegador" TEXT,
    "aceitoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AceiteDeTermos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AceiteDeTermos_escritorioId_documento_idx" ON "AceiteDeTermos"("escritorioId", "documento");

-- AddForeignKey
ALTER TABLE "AceiteDeTermos" ADD CONSTRAINT "AceiteDeTermos_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

