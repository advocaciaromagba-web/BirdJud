-- Acoes contratadas pelo cliente (01/11/2026, vindo do sistema da Advocacia Roma).
--
-- Cliente que contrata mais de uma acao precisa de uma procuracao para cada:
-- uma so, com as finalidades misturadas, atrapalha quando uma das acoes
-- termina ou e substabelecida. Ficam no cadastro, e nao so no momento de
-- gerar, porque procuracao costuma ser refeita depois.
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "acoesContratadas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
