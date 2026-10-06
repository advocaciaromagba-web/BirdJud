-- Lista de documentos a pedir ao cliente.
--
-- Um registro por DOCUMENTO, nao um JSON com a lista inteira: o que o
-- escritorio faz com isso e marcar o que ja chegou, um a um, e ligar ao
-- arquivo que chegou. Lista guardada como bloco unico nao deixa marcar nada.
CREATE TABLE IF NOT EXISTS "ItemDeChecklist" (
  "id"           TEXT PRIMARY KEY,
  "escritorioId" TEXT NOT NULL,
  "clienteId"    TEXT NOT NULL,
  "processoId"   TEXT,
  "grupo"        TEXT NOT NULL,
  "documento"    TEXT NOT NULL,
  "paraQue"      TEXT NOT NULL,
  "essencial"    BOOLEAN NOT NULL DEFAULT false,
  "ordem"        INTEGER NOT NULL DEFAULT 0,
  "tipoAcao"     TEXT,
  "entregueEm"   TIMESTAMP(3),
  "arquivoId"    TEXT,
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ItemDeChecklist_escritorioId_fkey" FOREIGN KEY ("escritorioId")
    REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ItemDeChecklist_clienteId_fkey" FOREIGN KEY ("clienteId")
    REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ItemDeChecklist_processoId_fkey" FOREIGN KEY ("processoId")
    REFERENCES "Processo"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ItemDeChecklist_arquivoId_fkey" FOREIGN KEY ("arquivoId")
    REFERENCES "Arquivo"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ItemDeChecklist_escritorioId_clienteId_idx"
  ON "ItemDeChecklist"("escritorioId", "clienteId");
CREATE INDEX IF NOT EXISTS "ItemDeChecklist_escritorioId_entregueEm_idx"
  ON "ItemDeChecklist"("escritorioId", "entregueEm");
