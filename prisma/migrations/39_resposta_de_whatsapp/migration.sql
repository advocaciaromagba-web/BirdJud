-- A resposta que chega pelo WhatsApp.
--
-- O sistema manda o lembrete da audiencia; quem recebe responde. Ate aqui a
-- resposta caia no vazio: o escritorio so sabia que o cliente nao viria quando
-- a cadeira ficava vazia na frente do juiz.

-- Quem respondeu ao lembrete, e o que respondeu.
ALTER TABLE "ParticipanteDeCompromisso"
  ADD COLUMN IF NOT EXISTS "confirmadoEm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "recusadoEm"   TIMESTAMP(3);

-- A mensagem recebida.
--
-- "escritorioId" e NULO de proposito em dois casos: numero desconhecido, e
-- numero que recebeu lembrete de DOIS escritorios na mesma janela. A politica
-- de RLS abaixo compara com o escritorio da sessao, entao NULO nao e visivel
-- para escritorio nenhum (NULL = ... nao e verdadeiro) — contar a um
-- escritorio que aquela pessoa tambem e cliente de outro seria vazamento.
CREATE TABLE IF NOT EXISTS "RespostaDeWhatsapp" (
  "id"             TEXT PRIMARY KEY,
  "escritorioId"   TEXT REFERENCES "Escritorio"("id") ON DELETE CASCADE,
  "idNaMeta"       TEXT NOT NULL,
  "telefone"       TEXT NOT NULL,
  "texto"          TEXT NOT NULL,
  "intencao"       TEXT NOT NULL,
  "avisoId"        TEXT,
  "compromissoId"  TEXT,
  "participanteId" TEXT,
  "semDono"        TEXT,
  "respondidoEm"   TIMESTAMP(3),
  "lidaEm"         TIMESTAMP(3),
  "criadoEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A Meta REENTREGA o mesmo evento quando o nosso 200 demora. Sem esta chave, a
-- mesma resposta seria processada de novo e o cliente receberia a resposta
-- automatica duas, tres vezes. O id da mensagem e global na Meta, entao o
-- indice tambem e global — e nao por escritorio.
CREATE UNIQUE INDEX IF NOT EXISTS "RespostaDeWhatsapp_idNaMeta_unico"
  ON "RespostaDeWhatsapp" ("idNaMeta");

CREATE INDEX IF NOT EXISTS "RespostaDeWhatsapp_escritorio_criado_idx"
  ON "RespostaDeWhatsapp" ("escritorioId", "criadoEm");
CREATE INDEX IF NOT EXISTS "RespostaDeWhatsapp_escritorio_compromisso_idx"
  ON "RespostaDeWhatsapp" ("escritorioId", "compromissoId");

-- Quem pediu para parar de receber.
--
-- Nao basta desligar o aviso do compromisso de hoje: a audiencia do mes que vem
-- geraria outro lembrete, e o pedido da pessoa teria durado tres semanas. Por
-- escritorio, e nao da plataforma inteira: os escritorios sao independentes, e
-- quem pede para parar de ouvir uma banca nao pediu para parar de ouvir outra.
CREATE TABLE IF NOT EXISTS "BloqueioDeWhatsapp" (
  "id"           TEXT PRIMARY KEY,
  "escritorioId" TEXT NOT NULL REFERENCES "Escritorio"("id") ON DELETE CASCADE,
  "telefone"     TEXT NOT NULL,
  "motivo"       TEXT NOT NULL DEFAULT 'PEDIDO_DA_PESSOA',
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "BloqueioDeWhatsapp_escritorio_telefone_unico"
  ON "BloqueioDeWhatsapp" ("escritorioId", "telefone");
