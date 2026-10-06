-- Segundo meio de pagamento: InfinitePay ao lado do Asaas.
--
-- A coluna chamava-se "idNoAsaas". Guardar nela o id de uma cobranca da
-- InfinitePay seria uma mentira gravada no banco — o tipo de detalhe que, seis
-- meses depois, faz alguem ler um numero e concluir a coisa errada sobre o
-- dinheiro de um cliente. Entao ela passa a se chamar pelo que e.
ALTER TABLE "Cobranca" RENAME COLUMN "idNoAsaas" TO "idNoProvedor";

ALTER INDEX IF EXISTS "Cobranca_escritorioId_idNoAsaas_key"
  RENAME TO "Cobranca_escritorioId_idNoProvedor_key";

-- ASAAS | INFINITEPAY. O que ja existe e do Asaas, que era o unico.
ALTER TABLE "Cobranca" ADD COLUMN IF NOT EXISTS "provedor" TEXT NOT NULL DEFAULT 'ASAAS';

CREATE INDEX IF NOT EXISTS "Cobranca_escritorioId_provedor_idx"
  ON "Cobranca"("escritorioId", "provedor");

-- O extrato tambem passa a dizer de que conta veio: o escritorio pode ter as
-- duas, e "Pix recebido" sem dizer onde nao ajuda ninguem a conferir.
ALTER TABLE "EntradaDeExtrato" ADD COLUMN IF NOT EXISTS "provedor" TEXT NOT NULL DEFAULT 'ASAAS';

-- A unicidade passa a ser por provedor: a InfinitePay nao manda id de
-- transacao no CSV, entao o nosso e um hash da linha — e um hash de uma linha
-- da InfinitePay poderia, em tese, colidir com um id do Asaas.
DROP INDEX IF EXISTS "EntradaDeExtrato_escritorioId_idNoProvedor_key";
CREATE UNIQUE INDEX IF NOT EXISTS "EntradaDeExtrato_escritorioId_provedor_idNoProvedor_key"
  ON "EntradaDeExtrato"("escritorioId", "provedor", "idNoProvedor");
