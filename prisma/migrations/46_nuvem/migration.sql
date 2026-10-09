-- Nuvem do escritorio: OneDrive ou Google Drive, conectado por OAuth.
--
-- PastaNaNuvem liga cada cliente a pasta dele na nuvem, pelo id do provedor.
-- Arquivo ganha a marca da copia, para a copia nao sair duas vezes.

ALTER TABLE "Arquivo" ADD COLUMN "nuvemProvedor" TEXT;
ALTER TABLE "Arquivo" ADD COLUMN "nuvemItemId" TEXT;

CREATE TABLE "PastaNaNuvem" (
  "id"           TEXT NOT NULL,
  "escritorioId" TEXT NOT NULL,
  "clienteId"    TEXT NOT NULL,
  "provedor"     TEXT NOT NULL,
  "pastaId"      TEXT NOT NULL,
  "endereco"     TEXT,
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PastaNaNuvem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PastaNaNuvem_escritorioId_provedor_clienteId_key"
  ON "PastaNaNuvem"("escritorioId", "provedor", "clienteId");
CREATE INDEX "PastaNaNuvem_escritorioId_idx" ON "PastaNaNuvem"("escritorioId");

ALTER TABLE "PastaNaNuvem" ADD CONSTRAINT "PastaNaNuvem_escritorioId_fkey"
  FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PastaNaNuvem" ADD CONSTRAINT "PastaNaNuvem_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
