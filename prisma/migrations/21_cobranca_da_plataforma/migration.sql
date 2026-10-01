-- A plataforma passa a emitir a cobranca da assinatura, nao so a fatura.
--
-- Ate aqui a regua gerava a Fatura e parava. Ninguem cobrava: quem marcava
-- como paga era um operador, na mao. Com um assinante isso e defensavel; com
-- dez, nao — e o escritorio seria suspenso por nao pagar uma fatura que nunca
-- lhe foi apresentada.

-- Id do escritorio como CLIENTE na conta Asaas da plataforma. Nao confundir
-- com Cliente.idNoAsaas, que e o cliente do escritorio na conta DELE: sao
-- contas diferentes, e misturar as duas cobraria a pessoa errada.
ALTER TABLE "Escritorio" ADD COLUMN IF NOT EXISTS "idNaCobrancaDaPlataforma" TEXT;

-- Para onde mandar o escritorio pagar. Guardado porque o e-mail da fatura
-- leva este link, e porque reenviar nao pode emitir cobranca nova.
ALTER TABLE "Fatura" ADD COLUMN IF NOT EXISTS "linkPagamento" TEXT;

-- Quando a cobranca foi emitida no provedor. Distingue "ainda nao emitimos"
-- de "emitimos e o link se perdeu" — dois problemas com remedios diferentes.
ALTER TABLE "Fatura" ADD COLUMN IF NOT EXISTS "emitidaEm" TIMESTAMP(3);

-- Uma fatura vira UMA cobranca, nunca duas. O indice unico e o que garante
-- isso mesmo quando a regua roda duas vezes no mesmo dia — e ela roda, porque
-- um operador pode passar a regua a mao enquanto o cron tambem passa.
CREATE UNIQUE INDEX IF NOT EXISTS "Fatura_idExterno_key"
  ON "Fatura"("idExterno") WHERE "idExterno" IS NOT NULL;
