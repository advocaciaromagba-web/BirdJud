-- Meta de faturamento do ano.
--
-- Uma por escritorio e por ano. O que o escritorio olha nao e o percentual —
-- "76% da meta" em marco e otimo e em dezembro e um ano perdido — e sim se da
-- tempo. O calculo do ritmo esta em src/lib/metas.ts.
CREATE TABLE IF NOT EXISTS "Meta" (
  "id"            TEXT PRIMARY KEY,
  "escritorioId"  TEXT NOT NULL,
  "ano"           INTEGER NOT NULL,
  "valorCentavos" INTEGER NOT NULL,
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Meta_escritorioId_fkey" FOREIGN KEY ("escritorioId")
    REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Uma meta por ano: duas seriam duas verdades sobre o mesmo ano.
CREATE UNIQUE INDEX IF NOT EXISTS "Meta_escritorioId_ano_key"
  ON "Meta"("escritorioId", "ano");
