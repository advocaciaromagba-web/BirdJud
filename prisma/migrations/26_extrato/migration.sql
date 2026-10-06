-- Extrato do meio de pagamento.
--
-- O webhook so avisa das cobrancas que passam por ele. O extrato e a verdade
-- do que entrou e do que saiu: tarifa, Pix avulso que ninguem emitiu cobranca,
-- estorno, e o saque para o banco. Sem conferir o extrato, o financeiro do
-- escritorio fica PARECIDO com a verdade — e parecido, em dinheiro, e errado.
--
-- O indice unico por (escritorio, id no provedor) e o que impede o mesmo
-- lancamento virar receita duas vezes quando alguem importa o mesmo periodo
-- de novo.
CREATE TABLE IF NOT EXISTS "EntradaDeExtrato" (
  "id"            TEXT PRIMARY KEY,
  "escritorioId"  TEXT NOT NULL,
  "idNoProvedor"  TEXT NOT NULL,
  "tipo"          TEXT NOT NULL,
  "valorCentavos" INTEGER NOT NULL,
  "data"          DATE NOT NULL,
  "descricao"     TEXT NOT NULL,
  "idDaCobranca"  TEXT,
  "destino"       TEXT NOT NULL,
  "situacao"      TEXT NOT NULL DEFAULT 'PENDENTE',
  "cobrancaId"    TEXT,
  "lancamentoId"  TEXT,
  "decididoEm"    TIMESTAMP(3),
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EntradaDeExtrato_escritorioId_fkey" FOREIGN KEY ("escritorioId")
    REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EntradaDeExtrato_cobrancaId_fkey" FOREIGN KEY ("cobrancaId")
    REFERENCES "Cobranca"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "EntradaDeExtrato_lancamentoId_fkey" FOREIGN KEY ("lancamentoId")
    REFERENCES "Lancamento"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "EntradaDeExtrato_escritorioId_idNoProvedor_key"
  ON "EntradaDeExtrato"("escritorioId", "idNoProvedor");
CREATE INDEX IF NOT EXISTS "EntradaDeExtrato_escritorioId_situacao_idx"
  ON "EntradaDeExtrato"("escritorioId", "situacao");
CREATE INDEX IF NOT EXISTS "EntradaDeExtrato_escritorioId_data_idx"
  ON "EntradaDeExtrato"("escritorioId", "data");
