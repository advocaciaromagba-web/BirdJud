-- Publicacao repetida.
--
-- O mesmo despacho sai UMA VEZ POR PARTE intimada, com id proprio do diario
-- para cada uma — entao o indice unico por id nao pega. Com duas OABs do
-- escritorio no mesmo ato, a mesma intimacao aparece duas vezes na tela, e a
-- segunda vira um prazo que nao existe.
--
-- NADA E APAGADO. Repeticao e MARCADA: a marcacao se desfaz, a exclusao nao.
-- E, na duvida, nao e duplicata — juntar dois atos diferentes pode custar um
-- prazo, e deixar uma repeticao custa um cartao a mais na tela.
ALTER TABLE "Publicacao" ADD COLUMN IF NOT EXISTS "duplicataDe" TEXT;
-- REPETIDA (marcada sozinha) | PARECE_REPETIDA (espera alguem dizer)
ALTER TABLE "Publicacao" ADD COLUMN IF NOT EXISTS "vereditoDeRepeticao" TEXT;
-- Quando alguem olhou e disse que NAO e repeticao. Separado do veredito para
-- a conferencia nao ser refeita a cada captura.
ALTER TABLE "Publicacao" ADD COLUMN IF NOT EXISTS "repeticaoNegadaEm" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "Publicacao" ADD CONSTRAINT "Publicacao_duplicataDe_fkey"
    FOREIGN KEY ("duplicataDe") REFERENCES "Publicacao"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Publicacao_escritorioId_duplicataDe_idx"
  ON "Publicacao"("escritorioId", "duplicataDe");
