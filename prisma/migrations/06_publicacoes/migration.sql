-- CreateTable
CREATE TABLE "OabMonitorada" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "nomeAdvogado" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimaCaptura" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OabMonitorada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Publicacao" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "idExterno" TEXT NOT NULL,
    "processoId" TEXT,
    "numeroProcesso" TEXT,
    "tribunal" TEXT,
    "orgao" TEXT,
    "tipoComunicacao" TEXT,
    "texto" TEXT NOT NULL,
    "link" TEXT,
    "oab" TEXT,
    "dataDisponibilizacao" TIMESTAMP(3) NOT NULL,
    "urgente" BOOLEAN NOT NULL DEFAULT false,
    "prazoDias" INTEGER,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "arquivada" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Publicacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OabMonitorada_escritorioId_ativo_idx" ON "OabMonitorada"("escritorioId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "OabMonitorada_escritorioId_numero_uf_key" ON "OabMonitorada"("escritorioId", "numero", "uf");

-- CreateIndex
CREATE INDEX "Publicacao_escritorioId_lida_arquivada_idx" ON "Publicacao"("escritorioId", "lida", "arquivada");

-- CreateIndex
CREATE INDEX "Publicacao_escritorioId_dataDisponibilizacao_idx" ON "Publicacao"("escritorioId", "dataDisponibilizacao");

-- CreateIndex
CREATE UNIQUE INDEX "Publicacao_escritorioId_idExterno_key" ON "Publicacao"("escritorioId", "idExterno");

-- AddForeignKey
ALTER TABLE "OabMonitorada" ADD CONSTRAINT "OabMonitorada_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publicacao" ADD CONSTRAINT "Publicacao_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publicacao" ADD CONSTRAINT "Publicacao_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

