-- Cortesia: escritorio que usa sem pagar, por tempo indeterminado.
ALTER TABLE "Assinatura" ADD COLUMN "cortesiaDesde" TIMESTAMP(3);
ALTER TABLE "Assinatura" ADD COLUMN "cortesiaMotivo" TEXT;
ALTER TABLE "Assinatura" ADD COLUMN "cortesiaPor" TEXT;
