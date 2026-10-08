-- Entrevista de triagem: a primeira conversa com quem procura o escritorio.
--
-- clienteId e NULO de proposito: quem chega para uma consulta pode nao virar
-- cliente, e exigir o cadastro antes encheria a base de gente que nunca
-- contratou. ON DELETE SET NULL, e nao CASCADE: apagar o cliente nao pode
-- levar junto o registro da conversa que o escritorio teve.
CREATE TABLE "Entrevista" (
  "id"           TEXT NOT NULL,
  "escritorioId" TEXT NOT NULL,
  "clienteId"    TEXT,
  "nome"         TEXT NOT NULL,
  "telefone"     TEXT,
  "assunto"      TEXT NOT NULL,
  "situacao"     TEXT NOT NULL DEFAULT 'RASCUNHO',
  "roteiro"      JSONB,
  "transcricao"  TEXT,
  "analise"      JSONB,
  "urgencia"     TEXT,
  "modelo"       TEXT,
  "usuarioId"    TEXT,
  "criadaEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadaEm" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Entrevista_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Entrevista_escritorioId_criadaEm_idx"
  ON "Entrevista"("escritorioId", "criadaEm");
CREATE INDEX "Entrevista_escritorioId_situacao_idx"
  ON "Entrevista"("escritorioId", "situacao");

ALTER TABLE "Entrevista"
  ADD CONSTRAINT "Entrevista_escritorioId_fkey"
  FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Entrevista"
  ADD CONSTRAINT "Entrevista_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
