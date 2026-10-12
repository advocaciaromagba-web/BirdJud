-- Entrevista no metodo do sistema da Advocacia Roma.
ALTER TABLE "Entrevista" ADD COLUMN "anotacoes" TEXT;
ALTER TABLE "Entrevista" ADD COLUMN "tipoAcao" TEXT;
ALTER TABLE "Entrevista" ADD COLUMN "origemTranscricao" TEXT;
ALTER TABLE "Entrevista" ADD COLUMN "encerradaEm" TIMESTAMP(3);
ALTER TABLE "Entrevista" ADD COLUMN "minutaPrompt" TEXT;
ALTER TABLE "Entrevista" ADD COLUMN "minutaGeradaEm" TIMESTAMP(3);
