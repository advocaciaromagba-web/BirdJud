-- CreateTable
CREATE TABLE "Arquivo" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "clienteId" TEXT,
    "processoId" TEXT,
    "usuarioId" TEXT,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "hash" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Arquivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Arquivo_escritorioId_criadoEm_idx" ON "Arquivo"("escritorioId", "criadoEm");

-- CreateIndex
CREATE INDEX "Arquivo_escritorioId_processoId_idx" ON "Arquivo"("escritorioId", "processoId");

-- CreateIndex
CREATE INDEX "Arquivo_escritorioId_clienteId_idx" ON "Arquivo"("escritorioId", "clienteId");

-- AddForeignKey
ALTER TABLE "Arquivo" ADD CONSTRAINT "Arquivo_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Arquivo" ADD CONSTRAINT "Arquivo_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Arquivo" ADD CONSTRAINT "Arquivo_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Arquivo" ADD CONSTRAINT "Arquivo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
