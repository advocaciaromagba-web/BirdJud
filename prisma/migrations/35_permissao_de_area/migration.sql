-- Quem o escritorio deixa entrar em cada area.
--
-- Terceira camada, depois do modulo (o escritorio contratou?) e do papel (a
-- pessoa e admin, advogado ou usuario?). O papel diz o que a pessoa E; a area
-- diz o que ESTE escritorio decidiu para ela — em uma banca a secretaria lanca
-- cobranca, em outra nem ve o financeiro, e as duas tem secretaria.
--
-- AUSENCIA DE LINHA E O PADRAO DA AREA, nao "proibido". Quase tudo nasce
-- aberto: ninguem pode perder acesso ao que ja usava no dia a dia so porque o
-- escritorio passou a ter um painel de permissoes. O que e dinheiro nasce
-- fechado. Ver src/lib/areas.ts.
CREATE TABLE IF NOT EXISTS "PermissaoDeArea" (
  "id"           TEXT PRIMARY KEY,
  "escritorioId" TEXT NOT NULL,
  "usuarioId"    TEXT NOT NULL,
  "area"         TEXT NOT NULL,
  "permitido"    BOOLEAN NOT NULL,
  "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PermissaoDeArea_escritorioId_fkey" FOREIGN KEY ("escritorioId")
    REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PermissaoDeArea_usuarioId_fkey" FOREIGN KEY ("usuarioId")
    REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Uma linha por pessoa e area: duas seriam duas respostas para a mesma
-- pergunta.
CREATE UNIQUE INDEX IF NOT EXISTS "PermissaoDeArea_usuarioId_area_key"
  ON "PermissaoDeArea"("usuarioId", "area");
CREATE INDEX IF NOT EXISTS "PermissaoDeArea_escritorioId_idx"
  ON "PermissaoDeArea"("escritorioId");
