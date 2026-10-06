-- Modelo de documento do escritorio.
--
-- Contrato, procuracao e declaracao saem no papel do escritorio: o timbre
-- dele, a fonte dele, a redacao que o advogado dele assina. O sistema guarda
-- o .docx que ele enviou e troca so os campos marcados.
--
-- Um modelo ATIVO por especie, por escritorio: na hora de gerar a peca nao
-- pode haver duvida sobre qual papel usar. O historico fica — modelo trocado
-- vira inativo em vez de sumir, porque a peca que saiu ontem saiu daquele
-- texto, e um dia alguem vai perguntar qual era.
CREATE TABLE IF NOT EXISTS "ModeloDeDocumento" (
  "id"            TEXT PRIMARY KEY,
  "escritorioId"  TEXT NOT NULL,
  -- CONTRATO | PROCURACAO | DECLARACAO
  "especie"       TEXT NOT NULL,
  "nomeDoArquivo" TEXT NOT NULL,
  "tamanhoBytes"  INTEGER NOT NULL,
  "hash"          TEXT NOT NULL,
  -- Campos que o modelo usa, e os que o sistema nao conhece. Guardados na
  -- hora do envio para a tela avisar sem reabrir o arquivo.
  "campos"        JSONB,
  "ativo"         BOOLEAN NOT NULL DEFAULT true,
  "enviadoPor"    TEXT,
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "substituidoEm" TIMESTAMP(3),
  CONSTRAINT "ModeloDeDocumento_escritorioId_fkey" FOREIGN KEY ("escritorioId")
    REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- A trava do "um ativo por especie". Parcial, para o historico poder ter
-- varios inativos da mesma especie.
CREATE UNIQUE INDEX IF NOT EXISTS "ModeloDeDocumento_ativo_key"
  ON "ModeloDeDocumento"("escritorioId", "especie")
  WHERE "ativo";

CREATE INDEX IF NOT EXISTS "ModeloDeDocumento_escritorioId_idx"
  ON "ModeloDeDocumento"("escritorioId");
