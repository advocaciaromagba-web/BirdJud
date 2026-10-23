-- Tabela de precos editavel pelo console (23/10/2026).
--
-- Uma linha so ("PLATAFORMA"). tabela: JSON com o que o operador mudou em
-- relacao a tabela padrao do codigo (faixa, planos, modulos e descontos de
-- ciclo). Nulo = vale a padrao. Contrato ja assinado nao muda: o valor
-- fechado fica em Assinatura.valorCentavos.
CREATE TABLE IF NOT EXISTS "ConfiguracaoComercial" (
  "id"            TEXT NOT NULL DEFAULT 'PLATAFORMA',
  "tabela"        JSONB,
  "atualizadaEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadaPor" TEXT,
  CONSTRAINT "ConfiguracaoComercial_pkey" PRIMARY KEY ("id")
);
