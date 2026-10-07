-- Quais advogados saem na peca deste cliente.
--
-- Em banca de um ou dois advogados a resposta e sempre "todos". Em escritorio
-- maior, nao: ha cliente que e so de uma das sociedades, ha acao que um socio
-- nao assina, e uma procuracao outorgando poderes a dez advogados quando dois
-- vao atuar e uma procuracao que da poder a mais gente do que o cliente quis.
--
-- VAZIO SIGNIFICA TODOS, de proposito: e o comportamento de antes, e nenhum
-- cliente ja cadastrado muda de ideia por causa desta migracao. Escritorio
-- pequeno nunca precisa mexer nisto.
ALTER TABLE "Cliente"
  ADD COLUMN IF NOT EXISTS "advogadosIds" TEXT[] NOT NULL DEFAULT '{}';
