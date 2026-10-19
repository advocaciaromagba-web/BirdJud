-- Alerta sonoro da agenda (19/10/2026): a tela de quem esta marcado para o
-- compromisso toca 1 hora e 15 minutos antes. Cada pessoa liga ou desliga
-- o som; comeca ligado.
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "alertaSonoro" BOOLEAN NOT NULL DEFAULT true;
