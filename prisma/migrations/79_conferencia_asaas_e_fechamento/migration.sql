-- Conferencia do Asaas e fechamento de caixa (03/11/2026, vindo do sistema da
-- Advocacia Roma).
--
-- Escritorio guarda o resultado da varredura diaria do Asaas: quantas
-- cobrancas estao la e nao aqui, e quando foi. A tela avisa por isso.
--
-- FechamentoDeCaixa e a FOTO do mes: os totais congelados, por forma de
-- pagamento e por quem recebeu. O mes nao fica travado: lancamento atrasado
-- continua entrando, e a tela compara a foto com a soma de agora. Refazer a
-- foto guarda quem, quando e quantas vezes.
ALTER TABLE "Escritorio" ADD COLUMN IF NOT EXISTS "asaasForaDoSistema" INTEGER;
ALTER TABLE "Escritorio" ADD COLUMN IF NOT EXISTS "asaasConferidoEm" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "FechamentoDeCaixa" (
  "id"              TEXT NOT NULL,
  "escritorioId"    TEXT NOT NULL,
  "competencia"     TEXT NOT NULL,
  "receitaCentavos" INTEGER NOT NULL,
  "despesaCentavos" INTEGER NOT NULL,
  "lancamentos"     INTEGER NOT NULL,
  "porForma"        JSONB NOT NULL,
  "porQuemRecebeu"  JSONB NOT NULL,
  "fechadoEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fechadoPor"      TEXT,
  "refeito"         INTEGER NOT NULL DEFAULT 0,
  "refeitoEm"       TIMESTAMP(3),
  "refeitoPor"      TEXT,
  CONSTRAINT "FechamentoDeCaixa_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FechamentoDeCaixa_escritorioId_competencia_key" ON "FechamentoDeCaixa"("escritorioId", "competencia");
DO $$ BEGIN
  ALTER TABLE "FechamentoDeCaixa" ADD CONSTRAINT "FechamentoDeCaixa_escritorioId_fkey"
    FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
