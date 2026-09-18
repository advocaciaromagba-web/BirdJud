-- Numero de processo em grafia canonica (so digitos) quando for CNJ.
--
-- Ate aqui o numero era gravado como o usuario digitasse. Com mascara, ele
-- nunca casava com o numero que vem do DJEN — e o vinculo automatico entre
-- publicacao e processo, que e o valor do modulo, simplesmente nao acontecia.
--
-- Numero que nao e CNJ (processo antigo, numeracao propria) fica como esta.
-- Linha cuja forma canonica ja existe no mesmo escritorio tambem fica: sao
-- duas linhas do mesmo processo, criadas antes de haver grafia unica, e
-- juntar uma na outra e decisao de quem conhece os autos, nao do script.
--
-- ATENCAO, VALE PARA TODA MIGRACAO DE DADOS DAQUI PARA A FRENTE:
-- as migracoes rodam como birdjud_owner, que TAMBEM esta sob FORCE ROW LEVEL
-- SECURITY. Sem app.escritorio_id definido, a politica nao devolve linha
-- nenhuma e o UPDATE afeta zero registros — em silencio, sem erro. Por isso o
-- FORCE e suspenso aqui e reposto logo em seguida. O Prisma roda cada migracao
-- em uma transacao, entao uma falha no meio desfaz tambem a suspensao.

ALTER TABLE "Processo" NO FORCE ROW LEVEL SECURITY;

UPDATE "Processo" AS p
SET "numero" = regexp_replace(p."numero", '\D', '', 'g')
WHERE length(regexp_replace(p."numero", '\D', '', 'g')) = 20
  AND p."numero" <> regexp_replace(p."numero", '\D', '', 'g')
  AND NOT EXISTS (
    SELECT 1 FROM "Processo" outro
    WHERE outro."escritorioId" = p."escritorioId"
      AND outro."numero" = regexp_replace(p."numero", '\D', '', 'g')
  );

ALTER TABLE "Processo" FORCE ROW LEVEL SECURITY;
