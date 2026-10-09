-- Entrega das mensagens: o retorno da Meta e o tratamento da falha.
ALTER TABLE "Aviso" ADD COLUMN "idNaMeta" TEXT;
ALTER TABLE "Aviso" ADD COLUMN "entregueEm" TIMESTAMP(3);
ALTER TABLE "Aviso" ADD COLUMN "lidoEm" TIMESTAMP(3);
ALTER TABLE "Aviso" ADD COLUMN "falhouEm" TIMESTAMP(3);
ALTER TABLE "Aviso" ADD COLUMN "erroCodigo" INTEGER;
ALTER TABLE "Aviso" ADD COLUMN "participanteId" TEXT;
ALTER TABLE "Aviso" ADD COLUMN "clienteId" TEXT;
ALTER TABLE "Aviso" ADD COLUMN "tratamento" TEXT;
ALTER TABLE "Aviso" ADD COLUMN "tratadoEm" TIMESTAMP(3);
ALTER TABLE "Aviso" ADD COLUMN "tratadoPor" TEXT;
ALTER TABLE "Aviso" ADD COLUMN "observacao" TEXT;
ALTER TABLE "Aviso" ADD COLUMN "reenvioDeId" TEXT;

CREATE UNIQUE INDEX "Aviso_idNaMeta_key" ON "Aviso"("idNaMeta");
CREATE INDEX "Aviso_escritorioId_estado_tratadoEm_idx" ON "Aviso"("escritorioId", "estado", "tratadoEm");

-- As falhas de ANTES desta migracao ficam com falhouEm nulo de proposito:
-- aparecem na tela Mensagens e na pendencia do Inicio, mas nao disparam
-- e-mail de alerta (a rotina so alerta falha com data) — senao a primeira
-- rodada mandaria de uma vez o alerta de tudo o que falhou antes.
