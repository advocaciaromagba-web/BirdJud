-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN "idNoAsaas" TEXT;

-- CreateTable
CREATE TABLE "Cobranca" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "processoId" TEXT,
    "descricao" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "forma" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "idNoAsaas" TEXT NOT NULL,
    "linkPagamento" TEXT,
    "linkBoleto" TEXT,
    "pagoEm" TIMESTAMP(3),
    "valorPagoCentavos" INTEGER,
    "lancamentoId" TEXT,
    "sincronizadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cobranca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cobranca_escritorioId_idNoAsaas_key" ON "Cobranca"("escritorioId", "idNoAsaas");

-- CreateIndex
CREATE INDEX "Cobranca_escritorioId_status_idx" ON "Cobranca"("escritorioId", "status");

-- CreateIndex
CREATE INDEX "Cobranca_escritorioId_vencimento_idx" ON "Cobranca"("escritorioId", "vencimento");

-- AddForeignKey
ALTER TABLE "Cobranca" ADD CONSTRAINT "Cobranca_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobranca" ADD CONSTRAINT "Cobranca_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobranca" ADD CONSTRAINT "Cobranca_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
