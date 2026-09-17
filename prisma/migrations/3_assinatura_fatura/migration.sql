-- CreateTable
CREATE TABLE "Assinatura" (
    "escritorioId" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "diaVencimento" INTEGER NOT NULL DEFAULT 10,
    "fimDoTeste" TIMESTAMP(3) NOT NULL,
    "canceladaEm" TIMESTAMP(3),
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assinatura_pkey" PRIMARY KEY ("escritorioId")
);

-- CreateTable
CREATE TABLE "Fatura" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "detalhe" JSONB,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "pagoEm" TIMESTAMP(3),
    "idExterno" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fatura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Fatura_escritorioId_status_idx" ON "Fatura"("escritorioId", "status");

-- CreateIndex
CREATE INDEX "Fatura_status_vencimento_idx" ON "Fatura"("status", "vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "Fatura_escritorioId_competencia_key" ON "Fatura"("escritorioId", "competencia");

-- AddForeignKey
ALTER TABLE "Assinatura" ADD CONSTRAINT "Assinatura_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fatura" ADD CONSTRAINT "Fatura_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

