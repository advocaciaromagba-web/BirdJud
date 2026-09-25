-- Recuperacao de senha.
--
-- tokenHash e unico: o token nunca e gravado, so o sha256 dele. A busca e
-- pelo hash, e o indice unico e o que impede dois pedidos colidirem.
CREATE TABLE "RedefinicaoDeSenha" (
  "id" TEXT NOT NULL,
  "escritorioId" TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiraEm" TIMESTAMP(3) NOT NULL,
  "usadoEm" TIMESTAMP(3),
  "pedidoDe" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RedefinicaoDeSenha_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RedefinicaoDeSenha_tokenHash_key" ON "RedefinicaoDeSenha"("tokenHash");
CREATE INDEX "RedefinicaoDeSenha_escritorioId_idx" ON "RedefinicaoDeSenha"("escritorioId");
CREATE INDEX "RedefinicaoDeSenha_escritorioId_usuarioId_idx" ON "RedefinicaoDeSenha"("escritorioId", "usuarioId");
CREATE INDEX "RedefinicaoDeSenha_expiraEm_idx" ON "RedefinicaoDeSenha"("expiraEm");

ALTER TABLE "RedefinicaoDeSenha"
  ADD CONSTRAINT "RedefinicaoDeSenha_escritorioId_fkey"
  FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
