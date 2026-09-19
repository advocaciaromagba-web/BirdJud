-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "recebeLembretes" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "recebeResumo" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Aviso" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "canal" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "assunto" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "enviadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Aviso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Aviso_escritorioId_estado_idx" ON "Aviso"("escritorioId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Aviso_escritorioId_chave_key" ON "Aviso"("escritorioId", "chave");

-- AddForeignKey
ALTER TABLE "Aviso" ADD CONSTRAINT "Aviso_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aviso" ADD CONSTRAINT "Aviso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

