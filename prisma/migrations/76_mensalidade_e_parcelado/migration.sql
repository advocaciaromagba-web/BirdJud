-- Mensalidade e fatura parcelada (02/11/2026, vindo do sistema da Advocacia Roma).
--
-- Mensalidade: a cobranca que se repete sem data para acabar (a assinatura
-- do Asaas). Quem gera o boleto seguinte e o proprio Asaas; aqui se espelha.
-- Chama-se mensalidade, e nao assinatura, porque "assinatura" neste sistema
-- e assinar documento.
--
-- Cobranca ganha o vinculo com a mensalidade e com o parcelamento do Asaas,
-- e "semBaixa": cobranca que chegou JA PAGA (historico trazido do Asaas) e
-- nao gera receita no livro-caixa — esse dinheiro ja entrou por outro
-- caminho, e contaria duas vezes.
CREATE TABLE IF NOT EXISTS "Mensalidade" (
  "id"                 TEXT NOT NULL,
  "escritorioId"       TEXT NOT NULL,
  "clienteId"          TEXT NOT NULL,
  "descricao"          TEXT NOT NULL,
  "valorCentavos"      INTEGER NOT NULL,
  "ciclo"              TEXT NOT NULL DEFAULT 'MENSAL',
  "forma"              TEXT NOT NULL DEFAULT 'QUALQUER',
  "proximoVencimento"  TIMESTAMP(3) NOT NULL,
  "idNoProvedor"       TEXT NOT NULL,
  "status"             TEXT NOT NULL DEFAULT 'ATIVA',
  "importada"          BOOLEAN NOT NULL DEFAULT false,
  "encerradaEm"        TIMESTAMP(3),
  "motivoEncerramento" TEXT,
  "sincronizadaEm"     TIMESTAMP(3),
  "criadoEm"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Mensalidade_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Mensalidade_escritorioId_idNoProvedor_key" ON "Mensalidade"("escritorioId", "idNoProvedor");
CREATE INDEX IF NOT EXISTS "Mensalidade_escritorioId_status_idx" ON "Mensalidade"("escritorioId", "status");
CREATE INDEX IF NOT EXISTS "Mensalidade_escritorioId_clienteId_idx" ON "Mensalidade"("escritorioId", "clienteId");
DO $$ BEGIN
  ALTER TABLE "Mensalidade" ADD CONSTRAINT "Mensalidade_escritorioId_fkey"
    FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Mensalidade" ADD CONSTRAINT "Mensalidade_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Cobranca" ADD COLUMN IF NOT EXISTS "mensalidadeId" TEXT;
ALTER TABLE "Cobranca" ADD COLUMN IF NOT EXISTS "parcelamentoId" TEXT;
ALTER TABLE "Cobranca" ADD COLUMN IF NOT EXISTS "semBaixa" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Cobranca_escritorioId_mensalidadeId_idx" ON "Cobranca"("escritorioId", "mensalidadeId");
CREATE INDEX IF NOT EXISTS "Cobranca_escritorioId_parcelamentoId_idx" ON "Cobranca"("escritorioId", "parcelamentoId");
DO $$ BEGIN
  ALTER TABLE "Cobranca" ADD CONSTRAINT "Cobranca_mensalidadeId_fkey"
    FOREIGN KEY ("mensalidadeId") REFERENCES "Mensalidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
