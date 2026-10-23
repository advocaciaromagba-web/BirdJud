-- Entrar no escritorio como suporte (23/10/2026).
--
-- O registro de acesso de suporte ganha o que a entrada precisa: ate quando
-- a sessao de suporte vale, como qual usuario ela entra, e quando o link de
-- uso unico foi usado (um link usado nao abre de novo).
ALTER TABLE "AcessoSuporte" ADD COLUMN IF NOT EXISTS "expiraEm" TIMESTAMP(3);
ALTER TABLE "AcessoSuporte" ADD COLUMN IF NOT EXISTS "comoUsuarioId" TEXT;
ALTER TABLE "AcessoSuporte" ADD COLUMN IF NOT EXISTS "linkUsadoEm" TIMESTAMP(3);
