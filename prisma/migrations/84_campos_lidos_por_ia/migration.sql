-- Completar o cadastro pelos documentos do cliente (15/11/2026, vindo do
-- sistema da Advocacia Roma). O que a IA preencheu fica marcado: dado lido
-- por IA e sugestao ate alguem conferir.
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "camposLidosPorIA" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
