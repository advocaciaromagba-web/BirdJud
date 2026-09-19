-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "bloqueadoAte" TIMESTAMP(3),
ADD COLUMN     "tentativasFalhas" INTEGER NOT NULL DEFAULT 0;

