-- Representantes legais de pessoa juridica.
--
-- Quem assina pela empresa e uma PESSOA, com qualificacao propria, e as vezes
-- mais de uma (socios que assinam em conjunto). Todos moram nesta tabela, em
-- ordem: guardar o primeiro em campos do cliente e os demais aqui, como faz o
-- sistema que inspirou isto, e onde nasce a peca faltando um socio — um codigo
-- le a tabela, outro le os campos.
CREATE TABLE IF NOT EXISTS "Representante" (
  "id"                     TEXT PRIMARY KEY,
  "escritorioId"           TEXT NOT NULL,
  "clienteId"              TEXT NOT NULL,
  "ordem"                  INTEGER NOT NULL DEFAULT 0,
  "nome"                   TEXT NOT NULL,
  "cpf"                    TEXT NOT NULL,
  "rg"                     TEXT,
  "nacionalidade"          TEXT,
  "estadoCivil"            TEXT,
  "profissao"              TEXT,
  "email"                  TEXT,
  "telefone"               TEXT,
  "mesmoEnderecoDaEmpresa" BOOLEAN NOT NULL DEFAULT true,
  "endereco"               JSONB,
  "criadoEm"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Representante_escritorioId_fkey" FOREIGN KEY ("escritorioId")
    REFERENCES "Escritorio"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Representante_clienteId_fkey" FOREIGN KEY ("clienteId")
    REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Representante_escritorioId_clienteId_idx"
  ON "Representante"("escritorioId", "clienteId");
