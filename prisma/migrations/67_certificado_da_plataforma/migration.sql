-- Certificado e-CNPJ da plataforma enviado pelo console (22/10/2026), em vez
-- de variavel de ambiente. O arquivo e a senha ficam cifrados com a
-- SEGREDO_CHAVE (src/lib/segredo.ts); titular e validade em claro, so para a
-- tela mostrar sem decifrar.
ALTER TABLE "FiscalDaPlataforma"
  ADD COLUMN IF NOT EXISTS "certificado" BYTEA,
  ADD COLUMN IF NOT EXISTS "certificadoTitular" TEXT,
  ADD COLUMN IF NOT EXISTS "certificadoValidoAte" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "certificadoEnviadoEm" TIMESTAMP(3);
