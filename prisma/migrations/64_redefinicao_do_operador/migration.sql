-- "Esqueci a senha" no console da plataforma (17/10/2026).
--
-- sessoesValidasApos: trocar a senha derruba as sessoes de operador abertas
-- antes dela (a conta que enxerga todos os escritorios nao pode continuar
-- aberta no navegador de quem tinha a senha antiga).
ALTER TABLE "OperadorPlataforma" ADD COLUMN IF NOT EXISTS "sessoesValidasApos" TIMESTAMP(3);

-- Pedidos de redefinicao. So o HASH do token; uso unico; 30 minutos.
CREATE TABLE IF NOT EXISTS "RedefinicaoDoOperador" (
  "id" TEXT NOT NULL,
  "operadorId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiraEm" TIMESTAMP(3) NOT NULL,
  "usadoEm" TIMESTAMP(3),
  "pedidoDe" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RedefinicaoDoOperador_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RedefinicaoDoOperador_operadorId_fkey" FOREIGN KEY ("operadorId")
    REFERENCES "OperadorPlataforma"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "RedefinicaoDoOperador_tokenHash_key" ON "RedefinicaoDoOperador"("tokenHash");
CREATE INDEX IF NOT EXISTS "RedefinicaoDoOperador_operadorId_idx" ON "RedefinicaoDoOperador"("operadorId");
