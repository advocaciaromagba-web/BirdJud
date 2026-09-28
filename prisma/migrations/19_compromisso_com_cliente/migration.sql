-- Cliente no compromisso.
--
-- Tarefa e compromisso sao a mesma tabela, separados por `tipo`. Ate aqui os
-- dois so tinham processo, e tarefa sem dono ficava solta: "protocolar
-- peticao" sem dizer de quem.
--
-- A regra passa a ser assimetrica, de proposito:
--   TAREFA      -> cliente obrigatorio, processo opcional (ha tarefa de
--                  escritorio que nao tem processo: levar documento ao
--                  cartorio, ligar para o cliente);
--   agendamento -> os dois opcionais (a reuniao pode ser com quem ainda nao e
--                  cliente).
-- A obrigatoriedade vive na API, nao aqui: a coluna e nula para que as linhas
-- que ja existem continuem validas.
ALTER TABLE "Compromisso" ADD COLUMN IF NOT EXISTS "clienteId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Compromisso_clienteId_fkey'
  ) THEN
    ALTER TABLE "Compromisso"
      ADD CONSTRAINT "Compromisso_clienteId_fkey"
      FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Compromisso_escritorioId_clienteId_idx"
  ON "Compromisso"("escritorioId", "clienteId");
