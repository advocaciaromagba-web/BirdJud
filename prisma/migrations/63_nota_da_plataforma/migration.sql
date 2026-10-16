-- Nota fiscal da mensalidade: a Blackbird emitindo para os escritorios
-- (decidido em 16/10/2026). Mesmo motor da NFS-e dos escritorios
-- (src/lib/nfse), com cadastro fiscal proprio da plataforma.

-- O emissor: uma linha so. Mesmos campos de "Fiscal", para o motor de regime
-- e IBS/CBS servir aos dois. O certificado NAO fica aqui: vem das variaveis
-- NFSE_PLATAFORMA_PFX e NFSE_PLATAFORMA_SENHA, no Railway.
CREATE TABLE IF NOT EXISTS "FiscalDaPlataforma" (
  "id" TEXT NOT NULL DEFAULT 'PLATAFORMA',
  "razaoSocial" TEXT NOT NULL,
  "cnpj" TEXT NOT NULL,
  "inscricaoMunicipal" TEXT,
  "codigoMunicipio" TEXT NOT NULL,
  "telefone" TEXT,
  "email" TEXT,
  "codigoTributacao" TEXT NOT NULL DEFAULT '010501',
  "opSimpNac" INTEGER NOT NULL DEFAULT 3,
  "regApTribSN" INTEGER DEFAULT 1,
  "regEspTrib" INTEGER NOT NULL DEFAULT 0,
  "pTotTribSN" DECIMAL(5,2),
  "pTotTribFed" DECIMAL(5,2),
  "pTotTribEst" DECIMAL(5,2),
  "pTotTribMun" DECIMAL(5,2),
  "ibsCbsDesde" TIMESTAMP(3),
  "cIndOp" TEXT DEFAULT '100301',
  "cstIbsCbs" TEXT DEFAULT '000',
  "cClassTribIbsCbs" TEXT DEFAULT '000001',
  "regApIBSCBSSN" INTEGER,
  "cAtvSN" INTEGER,
  "regimeFuturoDesde" TIMESTAMP(3),
  "regimeFuturo" JSONB,
  "codigoNbs" TEXT,
  "descricaoPadrao" TEXT NOT NULL DEFAULT 'Licenca de uso do sistema BirdJud (software como servico)',
  "serie" TEXT NOT NULL DEFAULT '1',
  "proximoNumero" INTEGER NOT NULL DEFAULT 1,
  "ambiente" TEXT NOT NULL DEFAULT 'HOMOLOGACAO',
  "automatica" BOOLEAN NOT NULL DEFAULT false,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FiscalDaPlataforma_pkey" PRIMARY KEY ("id")
);

-- As notas. escritorioId e o TOMADOR (sob RLS: o escritorio ve as suas).
-- Sem chave estrangeira de proposito: a nota e documento fiscal da
-- Blackbird e sobrevive ao expurgo do escritorio e da fatura.
CREATE TABLE IF NOT EXISTS "NotaDaPlataforma" (
  "id" TEXT NOT NULL,
  "escritorioId" TEXT NOT NULL,
  -- faturaId: a nota VIGENTE da fatura (unico). Cancelada, a nota solta a
  -- fatura (faturaId nulo) para outra poder ser emitida, e guarda a origem
  -- em faturaOriginalId.
  "faturaId" TEXT,
  "faturaOriginalId" TEXT,
  "origem" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROCESSANDO',
  "ambiente" TEXT NOT NULL,
  "serie" TEXT NOT NULL,
  "numero" INTEGER,
  "idDps" TEXT,
  "chaveAcesso" TEXT,
  "numeroNaPrefeitura" TEXT,
  "tomadorNome" TEXT NOT NULL,
  "tomadorDocumento" TEXT,
  "tomadorEmail" TEXT,
  "valorCentavos" INTEGER NOT NULL,
  "descricao" TEXT NOT NULL,
  "competencia" TIMESTAMP(3) NOT NULL,
  "xmlEnviado" TEXT,
  "xmlRetorno" TEXT,
  "erros" JSONB,
  "erro" TEXT,
  "emitidaEm" TIMESTAMP(3),
  "enviadaPara" TEXT,
  "enviadaEm" TIMESTAMP(3),
  "canceladaEm" TIMESTAMP(3),
  "motivoCancelamento" TEXT,
  "eventoXml" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotaDaPlataforma_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotaDaPlataforma_faturaId_key" ON "NotaDaPlataforma"("faturaId");
CREATE UNIQUE INDEX IF NOT EXISTS "NotaDaPlataforma_chaveAcesso_key" ON "NotaDaPlataforma"("chaveAcesso");
CREATE INDEX IF NOT EXISTS "NotaDaPlataforma_escritorioId_idx" ON "NotaDaPlataforma"("escritorioId");
