-- Contrato de honorarios: a cobranca que nasce do contrato.
--
-- Hoje cada parcela e digitada a mao, todo mes. Digitar todo mes e onde nasce
-- a parcela esquecida (o escritorio trabalha e nao cobra) e a parcela em dobro
-- (o cliente paga duas vezes e descobre antes do escritorio).
--
-- A unicidade por (escritorio, contrato, numero da parcela) e o que impede a
-- segunda: a mesma parcela nunca vira duas cobrancas, nem quando duas pessoas
-- clicam ao mesmo tempo, nem quando o cron roda duas vezes.
CREATE TABLE IF NOT EXISTS "ContratoDeHonorarios" (
  "id"                 TEXT PRIMARY KEY,
  "escritorioId"       TEXT NOT NULL,
  "clienteId"          TEXT NOT NULL,
  "processoId"         TEXT,
  -- VALOR | PERCENTUAL | MISTO
  "tipo"               TEXT NOT NULL,
  -- Parte fixa, em centavos. No MISTO, e a entrada.
  "valorCentavos"      INTEGER,
  -- Percentual de exito em centesimos: 30% = 3000. Inteiro, nunca float:
  -- dinheiro e percentual de dinheiro nao passam por ponto flutuante.
  "percentualBp"       INTEGER,
  "parcelas"           INTEGER NOT NULL DEFAULT 1,
  "primeiroVencimento" DATE,
  -- BOLETO | PIX | CARTAO | QUALQUER
  "forma"              TEXT NOT NULL DEFAULT 'BOLETO',
  -- Desligado, o plano continua visivel e a emissao e so a mao.
  "emissaoAutomatica"  BOOLEAN NOT NULL DEFAULT false,
  "descricao"          TEXT,
  "ativo"              BOOLEAN NOT NULL DEFAULT true,
  "encerradoEm"        TIMESTAMP(3),
  "criadoEm"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContratoDeHonorarios_escritorioId_fkey" FOREIGN KEY ("escritorioId")
    REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContratoDeHonorarios_clienteId_fkey" FOREIGN KEY ("clienteId")
    REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContratoDeHonorarios_processoId_fkey" FOREIGN KEY ("processoId")
    REFERENCES "Processo"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ContratoDeHonorarios_escritorioId_ativo_idx"
  ON "ContratoDeHonorarios"("escritorioId", "ativo");
CREATE INDEX IF NOT EXISTS "ContratoDeHonorarios_escritorioId_clienteId_idx"
  ON "ContratoDeHonorarios"("escritorioId", "clienteId");

-- De qual contrato e qual parcela a cobranca veio.
ALTER TABLE "Cobranca" ADD COLUMN IF NOT EXISTS "contratoId" TEXT;
ALTER TABLE "Cobranca" ADD COLUMN IF NOT EXISTS "parcelaNumero" INTEGER;
ALTER TABLE "Cobranca" ADD COLUMN IF NOT EXISTS "parcelaTotal" INTEGER;

DO $$ BEGIN
  ALTER TABLE "Cobranca" ADD CONSTRAINT "Cobranca_contratoId_fkey"
    FOREIGN KEY ("contratoId") REFERENCES "ContratoDeHonorarios"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A trava contra a parcela em dobro.
CREATE UNIQUE INDEX IF NOT EXISTS "Cobranca_contratoId_parcelaNumero_key"
  ON "Cobranca"("contratoId", "parcelaNumero")
  WHERE "contratoId" IS NOT NULL AND "parcelaNumero" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Cobranca_escritorioId_contratoId_idx"
  ON "Cobranca"("escritorioId", "contratoId");
