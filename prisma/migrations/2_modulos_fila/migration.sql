-- CreateTable
CREATE TABLE "Lancamento" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "pagoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trabalho" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT,
    "tipo" TEXT NOT NULL,
    "dados" JSONB,
    "estado" TEXT NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "maxTentativas" INTEGER NOT NULL DEFAULT 3,
    "agendadoPara" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciadoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    "erro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trabalho_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lancamento_escritorioId_idx" ON "Lancamento"("escritorioId");

-- CreateIndex
CREATE INDEX "Lancamento_escritorioId_competencia_idx" ON "Lancamento"("escritorioId", "competencia");

-- CreateIndex
CREATE INDEX "Trabalho_estado_agendadoPara_idx" ON "Trabalho"("estado", "agendadoPara");

-- CreateIndex
CREATE INDEX "Trabalho_escritorioId_estado_idx" ON "Trabalho"("escritorioId", "estado");

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trabalho" ADD CONSTRAINT "Trabalho_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

