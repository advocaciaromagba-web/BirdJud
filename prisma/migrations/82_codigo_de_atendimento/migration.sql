-- Codigo de atendimento por cliente, contra o golpe do falso advogado
-- (15/11/2026, vindo do sistema da Advocacia Roma).
--
-- Tabela propria, e nao coluna no Cliente, de proposito: o codigo nunca vem
-- junto numa consulta que devolve o cliente inteiro (formularios de tarefa,
-- agenda e cobranca listam clientes para quem nao tem a area de Codigos).
-- Unico por escritorio.
CREATE TABLE IF NOT EXISTS "CodigoDeAtendimento" (
  "id"              TEXT NOT NULL,
  "escritorioId"    TEXT NOT NULL,
  "clienteId"       TEXT NOT NULL,
  "codigo"          TEXT NOT NULL,
  "criadoEm"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Campanha de avisos: 0 = nao avisado; 1 = recebeu o aviso com o codigo;
  -- 2 a 5 = reforcos semanais, sem o codigo.
  "avisoEtapa"      INTEGER NOT NULL DEFAULT 0,
  "avisoEm"         TIMESTAMP(3),
  "avisoEmailEm"    TIMESTAMP(3),
  "avisoWhatsappEm" TIMESTAMP(3),
  CONSTRAINT "CodigoDeAtendimento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CodigoDeAtendimento_clienteId_key" ON "CodigoDeAtendimento"("clienteId");
CREATE UNIQUE INDEX IF NOT EXISTS "CodigoDeAtendimento_escritorioId_codigo_key" ON "CodigoDeAtendimento"("escritorioId", "codigo");
CREATE INDEX IF NOT EXISTS "CodigoDeAtendimento_escritorioId_avisoEtapa_idx" ON "CodigoDeAtendimento"("escritorioId", "avisoEtapa");
DO $$ BEGIN
  ALTER TABLE "CodigoDeAtendimento" ADD CONSTRAINT "CodigoDeAtendimento_escritorioId_fkey"
    FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CodigoDeAtendimento" ADD CONSTRAINT "CodigoDeAtendimento_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Toda vez que o codigo chegou ao cliente (ou que ele foi lembrado das
-- regras): por onde, para onde e quem entregou. O nome de quem entregou e
-- texto: sobrevive a pessoa sair da equipe.
CREATE TABLE IF NOT EXISTS "EntregaDeCodigo" (
  "id"           TEXT NOT NULL,
  "escritorioId" TEXT NOT NULL,
  "clienteId"    TEXT NOT NULL,
  "canal"        TEXT NOT NULL,
  "destino"      TEXT,
  "entreguePor"  TEXT,
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EntregaDeCodigo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EntregaDeCodigo_escritorioId_clienteId_idx" ON "EntregaDeCodigo"("escritorioId", "clienteId");
DO $$ BEGIN
  ALTER TABLE "EntregaDeCodigo" ADD CONSTRAINT "EntregaDeCodigo_escritorioId_fkey"
    FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "EntregaDeCodigo" ADD CONSTRAINT "EntregaDeCodigo_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
