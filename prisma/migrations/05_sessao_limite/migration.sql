-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "sessoesValidasApos" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LimiteDeTaxa" (
    "chave" TEXT NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 1,
    "ate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LimiteDeTaxa_pkey" PRIMARY KEY ("chave")
);

