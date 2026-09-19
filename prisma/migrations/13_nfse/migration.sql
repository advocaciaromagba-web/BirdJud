-- CreateTable
CREATE TABLE "Fiscal" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "inscricaoMunicipal" TEXT NOT NULL,
    "codigoMunicipio" TEXT NOT NULL,
    "regime" TEXT NOT NULL,
    "codigoTributacao" TEXT NOT NULL,
    "aliquotaMilesimos" INTEGER NOT NULL,
    "serie" TEXT NOT NULL DEFAULT '1',
    "proximoNumero" INTEGER NOT NULL DEFAULT 1,
    "ambiente" TEXT NOT NULL DEFAULT 'HOMOLOGACAO',
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fiscal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Fiscal_escritorioId_key" ON "Fiscal"("escritorioId");

-- CreateTable
CREATE TABLE "NotaFiscal" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "clienteId" TEXT,
    "cobrancaId" TEXT,
    "serie" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "chaveAcesso" TEXT,
    "numeroNaPrefeitura" TEXT,
    "linkPdf" TEXT,
    "xmlEnviado" TEXT,
    "xmlRetorno" TEXT,
    "erro" TEXT,
    "emitidaEm" TIMESTAMP(3),
    "canceladaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotaFiscal_escritorioId_serie_numero_key" ON "NotaFiscal"("escritorioId", "serie", "numero");

-- CreateIndex
CREATE INDEX "NotaFiscal_escritorioId_status_idx" ON "NotaFiscal"("escritorioId", "status");

-- CreateIndex
CREATE INDEX "NotaFiscal_escritorioId_criadoEm_idx" ON "NotaFiscal"("escritorioId", "criadoEm");

-- AddForeignKey
ALTER TABLE "Fiscal" ADD CONSTRAINT "Fiscal_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
