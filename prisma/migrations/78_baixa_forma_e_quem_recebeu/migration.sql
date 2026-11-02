-- Baixa manual com forma de pagamento e quem recebeu (03/11/2026, vindo do
-- sistema da Advocacia Roma).
--
-- Forma em campo proprio, e nao dentro da observacao: e o que permite somar
-- por forma no fechamento. Quem RECEBEU nao e quem lancou: a secretaria lanca
-- o que o advogado recebeu.
ALTER TABLE "BaixaDeCobranca" ADD COLUMN IF NOT EXISTS "forma" TEXT;
ALTER TABLE "BaixaDeCobranca" ADD COLUMN IF NOT EXISTS "recebidoPor" TEXT;
