-- O que fazer com cada publicacao.
--
-- Ate aqui a publicacao chegava, era lida e morria na lista: quem quisesse
-- transformar em prazo ou em audiencia reabria a agenda e digitava tudo de
-- novo. O que nao se digita de novo nao entra, e prazo que nao entra na
-- agenda e prazo perdido.
--
-- A SUGESTAO fica aqui ate alguem aceitar. O compromisso so nasce quando uma
-- pessoa clica: sistema que cria prazo sozinho na agenda do escritorio e
-- sistema em que ninguem confia na agenda.
--
-- UMA POR PUBLICACAO (indice unico): a triagem pode ser refeita, mas nao
-- pode haver duas sugestoes divergentes para o mesmo ato.
CREATE TABLE IF NOT EXISTS "TriagemDePublicacao" (
  "id"            TEXT PRIMARY KEY,
  "escritorioId"  TEXT NOT NULL REFERENCES "Escritorio"("id") ON DELETE CASCADE,
  "publicacaoId"  TEXT NOT NULL,
  "especie"       TEXT NOT NULL,
  "tipo"          TEXT NOT NULL,
  "titulo"        TEXT NOT NULL,
  "resumo"        TEXT NOT NULL,
  "prazoDias"     INTEGER,
  "contagem"      TEXT,
  "prazoFatal"    TIMESTAMP(3),
  "prazoSugerido" TIMESTAMP(3),
  "dataDoAto"     TIMESTAMP(3),
  "confianca"     TEXT NOT NULL,
  "atencao"       TEXT,
  "explicacao"    TEXT,
  "modelo"        TEXT,
  "compromissoId" TEXT,
  "aceitaEm"      TIMESTAMP(3),
  "recusadaEm"    TIMESTAMP(3),
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "TriagemDePublicacao_publicacaoId_key"
  ON "TriagemDePublicacao" ("publicacaoId");
CREATE INDEX IF NOT EXISTS "TriagemDePublicacao_escritorio_criado_idx"
  ON "TriagemDePublicacao" ("escritorioId", "criadoEm");
