-- Quem no escritorio ficou com a tarefa.
--
-- Ate aqui, tarefa criada era tarefa de todo mundo — o que na pratica quer
-- dizer de ninguem. Com responsavel, o sistema sabe para QUEM mandar o aviso
-- no WhatsApp quando a tarefa e designada ao advogado, a secretaria ou ao
-- estagiario.
--
-- Nulo continua valendo e e o padrao: compromisso do escritorio inteiro, como
-- sempre foi. Nenhuma linha existente muda de comportamento.
--
-- ON DELETE SET NULL, e nao CASCADE: desligar um usuario nao pode apagar a
-- audiencia que ele acompanhava.
ALTER TABLE "Compromisso"
  ADD COLUMN IF NOT EXISTS "responsavelId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Compromisso_responsavelId_fkey'
  ) THEN
    ALTER TABLE "Compromisso"
      ADD CONSTRAINT "Compromisso_responsavelId_fkey"
      FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "Compromisso_escritorioId_responsavelId_idx"
  ON "Compromisso" ("escritorioId", "responsavelId");
