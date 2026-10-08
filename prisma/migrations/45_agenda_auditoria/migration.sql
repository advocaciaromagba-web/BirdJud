-- Agenda com auditoria.
--
-- 1. Compromisso ganha o link da sala virtual, que vai no aviso ao cliente.
-- 2. Aviso passa a apontar para o compromisso que o gerou: e o que permite a
--    tela "Notificacoes enviadas" provar quem foi avisado de que, e quando.
-- 3. CompromissoExcluido guarda o que saiu da agenda — apagado por alguem ou
--    arquivado por ter vencido — so para consulta.

ALTER TABLE "Compromisso" ADD COLUMN "link" TEXT;

ALTER TABLE "Aviso" ADD COLUMN "compromissoId" TEXT;
ALTER TABLE "Aviso" ADD CONSTRAINT "Aviso_compromissoId_fkey"
  FOREIGN KEY ("compromissoId") REFERENCES "Compromisso"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Aviso_escritorioId_compromissoId_idx"
  ON "Aviso"("escritorioId", "compromissoId");

-- Os avisos que ja existem levam o id do compromisso dentro da chave
-- ("lembrete:<id>:<usuario>", "zap:marcado:<id>:<participante>" ...). Casar
-- pela chave e o que liga o historico antigo ao compromisso.
UPDATE "Aviso" a
   SET "compromissoId" = c."id"
  FROM "Compromisso" c
 WHERE a."compromissoId" IS NULL
   AND a."escritorioId" = c."escritorioId"
   AND a."tipo" IN ('LEMBRETE_COMPROMISSO', 'LEMBRETE_AO_PARTICIPANTE',
                    'COMPROMISSO_MARCADO', 'TAREFA_DESIGNADA')
   AND a."chave" LIKE '%:' || c."id" || ':%';

CREATE TABLE "CompromissoExcluido" (
  "id"                TEXT NOT NULL,
  "escritorioId"      TEXT NOT NULL,
  "compromissoId"     TEXT NOT NULL,
  "titulo"            TEXT NOT NULL,
  "tipo"              TEXT NOT NULL,
  "inicio"            TIMESTAMP(3) NOT NULL,
  "fim"               TIMESTAMP(3),
  "local"             TEXT,
  "link"              TEXT,
  "numeroProcesso"    TEXT,
  "nomeDoCliente"     TEXT,
  "nomeDoResponsavel" TEXT,
  "participantes"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "motivo"            TEXT NOT NULL,
  "excluidoPorId"     TEXT,
  "nomeDeQuemExcluiu" TEXT,
  "excluidoEm"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CompromissoExcluido_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompromissoExcluido_escritorioId_excluidoEm_idx"
  ON "CompromissoExcluido"("escritorioId", "excluidoEm");

ALTER TABLE "CompromissoExcluido" ADD CONSTRAINT "CompromissoExcluido_escritorioId_fkey"
  FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
