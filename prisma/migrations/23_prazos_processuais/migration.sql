-- Prazos processuais.
--
-- A conta mora em src/lib/prazos.ts, nunca no banco e nunca na leitura de um
-- documento: prazo errado perde o direito, e e o unico erro deste sistema sem
-- conserto depois.
--
-- O resultado da conta fica GRAVADO (inicioContagem, vencimento, explicacao)
-- em vez de recalculado na leitura. O calendario do escritorio muda — um
-- feriado municipal cadastrado depois —, e prazo ja comunicado ao cliente nao
-- pode mudar de data sozinho.
CREATE TABLE IF NOT EXISTS "Prazo" (
  "id"             TEXT PRIMARY KEY,
  "escritorioId"   TEXT NOT NULL,
  "processoId"     TEXT,
  "clienteId"      TEXT,
  "titulo"         TEXT NOT NULL,
  "termoInicial"   DATE NOT NULL,
  "dias"           INTEGER NOT NULL,
  "contagem"       TEXT NOT NULL DEFAULT 'UTEIS',
  "inicioContagem" DATE NOT NULL,
  "vencimento"     DATE NOT NULL,
  "explicacao"     TEXT NOT NULL,
  "responsavelId"  TEXT,
  "cumpridoEm"     TIMESTAMP(3),
  "observacao"     TEXT,
  "criadoEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Prazo_escritorioId_fkey" FOREIGN KEY ("escritorioId")
    REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Prazo_processoId_fkey" FOREIGN KEY ("processoId")
    REFERENCES "Processo"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Prazo_clienteId_fkey" FOREIGN KEY ("clienteId")
    REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Prazo_responsavelId_fkey" FOREIGN KEY ("responsavelId")
    REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Prazo_escritorioId_vencimento_idx"
  ON "Prazo"("escritorioId", "vencimento");
CREATE INDEX IF NOT EXISTS "Prazo_escritorioId_cumpridoEm_idx"
  ON "Prazo"("escritorioId", "cumpridoEm");
CREATE INDEX IF NOT EXISTS "Prazo_escritorioId_processoId_idx"
  ON "Prazo"("escritorioId", "processoId");

-- Dia sem expediente do PROPRIO escritorio: feriado municipal, suspensao de
-- tribunal, ponto facultativo da comarca. Nao cabe em lista nacional porque
-- cada escritorio trabalha em comarcas diferentes — e e justamente o dia que
-- ninguem lembra de conferir.
CREATE TABLE IF NOT EXISTS "DiaSemExpediente" (
  "id"           TEXT PRIMARY KEY,
  "escritorioId" TEXT NOT NULL,
  "dia"          DATE NOT NULL,
  "motivo"       TEXT NOT NULL,
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiaSemExpediente_escritorioId_fkey" FOREIGN KEY ("escritorioId")
    REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DiaSemExpediente_escritorioId_dia_key"
  ON "DiaSemExpediente"("escritorioId", "dia");
