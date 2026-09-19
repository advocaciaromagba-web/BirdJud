-- CreateTable
CREATE TABLE "Escritorio" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TESTE',
    "faixa" TEXT NOT NULL DEFAULT 'ATE_3',
    "logoUrl" TEXT,
    "corPrimaria" TEXT,
    "corSecundaria" TEXT,
    "telefoneAtendimento" TEXT,
    "cidade" TEXT,
    "enderecos" JSONB,
    "expediente" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Escritorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuloContratado" (
    "escritorioId" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "franquia" INTEGER,
    "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModuloContratado_pkey" PRIMARY KEY ("escritorioId","modulo")
);

-- CreateTable
CREATE TABLE "Integracao" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dados" BYTEA NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "erro" TEXT,
    "verificadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Integracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumoMensal" (
    "escritorioId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "metrica" TEXT NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ConsumoMensal_pkey" PRIMARY KEY ("escritorioId","competencia","metrica")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" TEXT NOT NULL DEFAULT 'USUARIO',
    "oab" TEXT,
    "advogado" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "doisFatores" TEXT,
    "ultimoAcesso" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "endereco" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Processo" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "clienteId" TEXT,
    "numero" TEXT NOT NULL,
    "tribunal" TEXT,
    "vara" TEXT,
    "area" TEXT,
    "situacao" TEXT NOT NULL DEFAULT 'ATIVO',
    "distribuicao" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Processo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Compromisso" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "processoId" TEXT,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'COMPROMISSO',
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3),
    "local" TEXT,
    "observacoes" TEXT,
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Compromisso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperadorPlataforma" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperadorPlataforma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcessoSuporte" (
    "id" TEXT NOT NULL,
    "operadorId" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "encerradoEm" TIMESTAMP(3),

    CONSTRAINT "AcessoSuporte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Escritorio_slug_key" ON "Escritorio"("slug");

-- CreateIndex
CREATE INDEX "ModuloContratado_escritorioId_idx" ON "ModuloContratado"("escritorioId");

-- CreateIndex
CREATE INDEX "Integracao_escritorioId_idx" ON "Integracao"("escritorioId");

-- CreateIndex
CREATE UNIQUE INDEX "Integracao_escritorioId_tipo_key" ON "Integracao"("escritorioId", "tipo");

-- CreateIndex
CREATE INDEX "ConsumoMensal_escritorioId_idx" ON "ConsumoMensal"("escritorioId");

-- CreateIndex
CREATE INDEX "Usuario_escritorioId_idx" ON "Usuario"("escritorioId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_escritorioId_email_key" ON "Usuario"("escritorioId", "email");

-- CreateIndex
CREATE INDEX "Cliente_escritorioId_idx" ON "Cliente"("escritorioId");

-- CreateIndex
CREATE INDEX "Cliente_escritorioId_documento_idx" ON "Cliente"("escritorioId", "documento");

-- CreateIndex
CREATE INDEX "Processo_escritorioId_idx" ON "Processo"("escritorioId");

-- CreateIndex
CREATE UNIQUE INDEX "Processo_escritorioId_numero_key" ON "Processo"("escritorioId", "numero");

-- CreateIndex
CREATE INDEX "Compromisso_escritorioId_idx" ON "Compromisso"("escritorioId");

-- CreateIndex
CREATE INDEX "Compromisso_escritorioId_inicio_idx" ON "Compromisso"("escritorioId", "inicio");

-- CreateIndex
CREATE UNIQUE INDEX "OperadorPlataforma_email_key" ON "OperadorPlataforma"("email");

-- CreateIndex
CREATE INDEX "AcessoSuporte_escritorioId_idx" ON "AcessoSuporte"("escritorioId");

-- AddForeignKey
ALTER TABLE "ModuloContratado" ADD CONSTRAINT "ModuloContratado_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integracao" ADD CONSTRAINT "Integracao_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoMensal" ADD CONSTRAINT "ConsumoMensal_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Processo" ADD CONSTRAINT "Processo_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Processo" ADD CONSTRAINT "Processo_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compromisso" ADD CONSTRAINT "Compromisso_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compromisso" ADD CONSTRAINT "Compromisso_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcessoSuporte" ADD CONSTRAINT "AcessoSuporte_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "OperadorPlataforma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

