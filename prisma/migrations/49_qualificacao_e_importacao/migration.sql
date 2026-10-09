-- Qualificacao do cliente pessoa fisica e importacao de clientes por planilha.
ALTER TABLE "Cliente" ADD COLUMN "rg" TEXT;
ALTER TABLE "Cliente" ADD COLUMN "nascimento" DATE;
ALTER TABLE "Cliente" ADD COLUMN "nacionalidade" TEXT;
ALTER TABLE "Cliente" ADD COLUMN "estadoCivil" TEXT;
ALTER TABLE "Cliente" ADD COLUMN "profissao" TEXT;
ALTER TABLE "Cliente" ADD COLUMN "observacoes" TEXT;
ALTER TABLE "Cliente" ADD COLUMN "importacaoId" TEXT;
CREATE INDEX "Cliente_escritorioId_importacaoId_idx" ON "Cliente"("escritorioId", "importacaoId");

CREATE TABLE "ImportacaoDeClientes" (
  "id"                 TEXT NOT NULL,
  "escritorioId"       TEXT NOT NULL,
  "nomeDoArquivo"      TEXT NOT NULL,
  "feitaPor"           TEXT,
  "linhas"             INTEGER NOT NULL,
  "importados"         INTEGER NOT NULL,
  "jaExistiam"         INTEGER NOT NULL,
  "recusados"          INTEGER NOT NULL,
  "criadaEm"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "desfeitaEm"         TIMESTAMP(3),
  "mantidosAoDesfazer" INTEGER,
  CONSTRAINT "ImportacaoDeClientes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ImportacaoDeClientes_escritorioId_criadaEm_idx"
  ON "ImportacaoDeClientes"("escritorioId", "criadaEm");
ALTER TABLE "ImportacaoDeClientes" ADD CONSTRAINT "ImportacaoDeClientes_escritorioId_fkey"
  FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
