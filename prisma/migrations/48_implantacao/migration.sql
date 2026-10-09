-- Implantacao pela plataforma: a Blackbird monta a conta do escritorio e a
-- entrega pronta. Guarda quem montou, quando, e quando foi entregue.
ALTER TABLE "Escritorio" ADD COLUMN "implantadoPor" TEXT;
ALTER TABLE "Escritorio" ADD COLUMN "implantadoEm" TIMESTAMP(3);
ALTER TABLE "Escritorio" ADD COLUMN "entregueEm" TIMESTAMP(3);
