-- O financeiro deixa de ser uma tabela de quatro campos.
--
-- Ate aqui Lancamento tinha descricao, valor, tipo e competencia. Dava para
-- somar entradas e saidas e nada mais: nao dava para dizer quanto o escritorio
-- gasta com energia, nem separar o que ja foi pago do que vence semana que
-- vem, nem ligar uma retirada a cobranca que a originou.
ALTER TABLE "Lancamento" ADD COLUMN IF NOT EXISTS "categoria" TEXT;
ALTER TABLE "Lancamento" ADD COLUMN IF NOT EXISTS "fornecedor" TEXT;
ALTER TABLE "Lancamento" ADD COLUMN IF NOT EXISTS "vencimento" TIMESTAMP(3);
ALTER TABLE "Lancamento" ADD COLUMN IF NOT EXISTS "observacoes" TEXT;
-- De qual cobranca do Asaas esta receita veio. Permite conciliar sem digitar
-- duas vezes, e impede lancar a mesma cobranca duas vezes.
ALTER TABLE "Lancamento" ADD COLUMN IF NOT EXISTS "cobrancaId" TEXT;
-- De qual despesa fixa este lancamento foi gerado, para o mes seguinte saber
-- que ja gerou e nao duplicar.
ALTER TABLE "Lancamento" ADD COLUMN IF NOT EXISTS "despesaFixaId" TEXT;
-- O documento lido (conta de agua, boleto), guardado junto.
ALTER TABLE "Lancamento" ADD COLUMN IF NOT EXISTS "arquivoId" TEXT;

CREATE INDEX IF NOT EXISTS "Lancamento_escritorioId_categoria_idx"
  ON "Lancamento"("escritorioId", "categoria");
CREATE INDEX IF NOT EXISTS "Lancamento_escritorioId_vencimento_idx"
  ON "Lancamento"("escritorioId", "vencimento");

-- Uma cobranca do Asaas vira UM lancamento, nunca dois. O indice unico e o
-- que garante isso mesmo se o webhook chegar em duplicata — e webhook chega
-- em duplicata.
CREATE UNIQUE INDEX IF NOT EXISTS "Lancamento_escritorioId_cobrancaId_key"
  ON "Lancamento"("escritorioId", "cobrancaId")
  WHERE "cobrancaId" IS NOT NULL;

-- Despesa fixa: o que se repete todo mes e ninguem quer redigitar.
CREATE TABLE IF NOT EXISTS "DespesaFixa" (
  "id"             TEXT NOT NULL,
  "escritorioId"   TEXT NOT NULL,
  "descricao"      TEXT NOT NULL,
  "categoria"      TEXT NOT NULL,
  "fornecedor"     TEXT,
  -- Valor previsto. Conta de agua muda todo mes, entao o lancamento gerado
  -- entra como previsao e e corrigido quando a conta chega.
  "valorCentavos"  INTEGER NOT NULL,
  "diaDoVencimento" INTEGER NOT NULL,
  "ativo"          BOOLEAN NOT NULL DEFAULT true,
  "criadoEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DespesaFixa_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DespesaFixa_escritorioId_fkey') THEN
    ALTER TABLE "DespesaFixa" ADD CONSTRAINT "DespesaFixa_escritorioId_fkey"
      FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lancamento_despesaFixaId_fkey') THEN
    ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_despesaFixaId_fkey"
      FOREIGN KEY ("despesaFixaId") REFERENCES "DespesaFixa"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lancamento_arquivoId_fkey') THEN
    ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_arquivoId_fkey"
      FOREIGN KEY ("arquivoId") REFERENCES "Arquivo"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "DespesaFixa_escritorioId_idx" ON "DespesaFixa"("escritorioId");

-- Uma despesa fixa gera um lancamento por competencia, nunca dois.
CREATE UNIQUE INDEX IF NOT EXISTS "Lancamento_despesaFixa_competencia_key"
  ON "Lancamento"("despesaFixaId", "competencia")
  WHERE "despesaFixaId" IS NOT NULL;
