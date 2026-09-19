-- CreateTable
CREATE TABLE "AnaliseIA" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "publicacaoId" TEXT,
    "tipo" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "tokensEntrada" INTEGER NOT NULL,
    "tokensSaida" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnaliseIA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnaliseIA_escritorioId_criadoEm_idx" ON "AnaliseIA"("escritorioId", "criadoEm");

-- CreateIndex
CREATE INDEX "AnaliseIA_publicacaoId_idx" ON "AnaliseIA"("publicacaoId");

-- AddForeignKey
ALTER TABLE "AnaliseIA" ADD CONSTRAINT "AnaliseIA_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnaliseIA" ADD CONSTRAINT "AnaliseIA_publicacaoId_fkey" FOREIGN KEY ("publicacaoId") REFERENCES "Publicacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

