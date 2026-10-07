-- Peca mandada para assinatura eletronica.
--
-- Por que guardar, se o provedor ja guarda: para o escritorio saber onde esta
-- cada peca sem abrir o site de outro sistema, e para NAO MANDAR DUAS VEZES.
-- Cada envio custa ao escritorio — o plano do Autentique e dele, cobrado por
-- documento — e dois cliques no mesmo botao mandariam dois contratos ao mesmo
-- cliente, que recebe dois e-mails e nao sabe qual assinar.
--
-- `provedor` ja nasce como coluna, e nao fica implicito no nome da tabela:
-- Autentique e o primeiro, nao o unico possivel.
CREATE TABLE IF NOT EXISTS "EnvioParaAssinatura" (
  "id"            TEXT PRIMARY KEY,
  "escritorioId"  TEXT NOT NULL REFERENCES "Escritorio"("id") ON DELETE CASCADE,
  "clienteId"     TEXT NOT NULL,
  "especie"       TEXT NOT NULL,
  "provedor"      TEXT NOT NULL DEFAULT 'AUTENTIQUE',
  "idNoProvedor"  TEXT NOT NULL,
  "nomeDoArquivo" TEXT NOT NULL,
  "signatarios"   JSONB NOT NULL,
  "situacao"      TEXT NOT NULL DEFAULT 'ENVIADO',
  "enviadoPor"    TEXT,
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "conferidoEm"   TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "EnvioParaAssinatura_escritorioId_clienteId_idx"
  ON "EnvioParaAssinatura" ("escritorioId", "clienteId");

-- O mesmo documento do provedor nao pode entrar duas vezes no mesmo
-- escritorio: e o que torna o registro de envio confiavel para dizer "ja foi".
CREATE UNIQUE INDEX IF NOT EXISTS "EnvioParaAssinatura_provedor_id_unico"
  ON "EnvioParaAssinatura" ("escritorioId", "provedor", "idNoProvedor");
