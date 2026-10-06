-- Quem mais vai ao compromisso.
--
-- Audiencia com dois clientes, atendimento com o cliente e o conjuge, reuniao
-- com testemunha e preposto. Ate aqui o compromisso tinha UM cliente, e quem
-- mais precisava saber da hora e do lugar ficava fora do sistema.
--
-- O participante pode NAO ser cliente. Testemunha e acompanhante nao viram
-- cadastro de cliente so para receber um aviso: ficariam para sempre na lista
-- do escritorio, apareceriam na busca, na emissao de cobranca e na escolha de
-- quem assina uma procuracao. Por isso quem e de fora tem nome e contato aqui,
-- e so aqui.
CREATE TABLE IF NOT EXISTS "ParticipanteDeCompromisso" (
  "id"            TEXT PRIMARY KEY,
  "escritorioId"  TEXT NOT NULL,
  "compromissoId" TEXT NOT NULL,
  -- Preenchido quando a pessoa ja e cliente do escritorio.
  "clienteId"     TEXT,
  -- Usados quando nao e cliente. Nunca os dois caminhos ao mesmo tempo: o nome
  -- do cliente e o do cadastro, e copiar deixaria os dois diferentes no dia em
  -- que alguem corrigisse um deles.
  "nome"          TEXT,
  -- Guardado ja no formato de envio, nao como foi digitado: assim
  -- "(11) 9 9999-0000" e "11999990000" sao a mesma pessoa na hora de nao
  -- avisar duas vezes.
  "telefone"      TEXT,
  "email"         TEXT,
  -- testemunha, conjuge, preposto, perito... Campo livre: a vida tem mais
  -- papeis que uma lista.
  "papel"         TEXT,
  "avisar"        BOOLEAN NOT NULL DEFAULT true,
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParticipanteDeCompromisso_escritorioId_fkey" FOREIGN KEY ("escritorioId")
    REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ParticipanteDeCompromisso_compromissoId_fkey" FOREIGN KEY ("compromissoId")
    REFERENCES "Compromisso"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ParticipanteDeCompromisso_clienteId_fkey" FOREIGN KEY ("clienteId")
    REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ParticipanteDeCompromisso_compromissoId_idx"
  ON "ParticipanteDeCompromisso"("compromissoId");
CREATE INDEX IF NOT EXISTS "ParticipanteDeCompromisso_escritorioId_idx"
  ON "ParticipanteDeCompromisso"("escritorioId");
