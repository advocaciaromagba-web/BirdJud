-- NFS-e em dois tempos: a equipe PREPARA, o titular do e-CNPJ ASSINA.
-- Cadastro do emissor no leiaute nacional (regime, tributos aproximados,
-- IBS/CBS, mudanca de regime em data marcada).

ALTER TABLE "Fiscal" ALTER COLUMN "inscricaoMunicipal" DROP NOT NULL;
ALTER TABLE "Fiscal" ALTER COLUMN "aliquotaMilesimos" SET DEFAULT 0;
ALTER TABLE "Fiscal" ALTER COLUMN "codigoTributacao" SET DEFAULT '171401';
ALTER TABLE "Fiscal" ALTER COLUMN "regime" SET DEFAULT 'SIMPLES';
ALTER TABLE "Fiscal" ADD COLUMN "telefone" TEXT;
ALTER TABLE "Fiscal" ADD COLUMN "email" TEXT;
ALTER TABLE "Fiscal" ADD COLUMN "opSimpNac" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Fiscal" ADD COLUMN "regApTribSN" INTEGER DEFAULT 1;
ALTER TABLE "Fiscal" ADD COLUMN "regEspTrib" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Fiscal" ADD COLUMN "pTotTribSN" DECIMAL(5,2);
ALTER TABLE "Fiscal" ADD COLUMN "pTotTribFed" DECIMAL(5,2);
ALTER TABLE "Fiscal" ADD COLUMN "pTotTribEst" DECIMAL(5,2);
ALTER TABLE "Fiscal" ADD COLUMN "pTotTribMun" DECIMAL(5,2);
ALTER TABLE "Fiscal" ADD COLUMN "ibsCbsDesde" TIMESTAMP(3);
ALTER TABLE "Fiscal" ADD COLUMN "cIndOp" TEXT DEFAULT '100301';
ALTER TABLE "Fiscal" ADD COLUMN "cstIbsCbs" TEXT DEFAULT '000';
ALTER TABLE "Fiscal" ADD COLUMN "cClassTribIbsCbs" TEXT DEFAULT '000001';
ALTER TABLE "Fiscal" ADD COLUMN "regApIBSCBSSN" INTEGER;
ALTER TABLE "Fiscal" ADD COLUMN "cAtvSN" INTEGER;
ALTER TABLE "Fiscal" ADD COLUMN "regimeFuturoDesde" TIMESTAMP(3);
ALTER TABLE "Fiscal" ADD COLUMN "regimeFuturo" JSONB;
ALTER TABLE "Fiscal" ADD COLUMN "codigoNbs" TEXT DEFAULT '113012000';
ALTER TABLE "Fiscal" ADD COLUMN "descricaoPadrao" TEXT;

ALTER TABLE "NotaFiscal" ALTER COLUMN "numero" DROP NOT NULL;
ALTER TABLE "NotaFiscal" ALTER COLUMN "status" SET DEFAULT 'AGUARDANDO_ASSINATURA';
ALTER TABLE "NotaFiscal" ADD COLUMN "ambiente" TEXT NOT NULL DEFAULT 'HOMOLOGACAO';
ALTER TABLE "NotaFiscal" ADD COLUMN "dataCompetencia" TIMESTAMP(3);
ALTER TABLE "NotaFiscal" ADD COLUMN "informacoesComplementares" TEXT;
ALTER TABLE "NotaFiscal" ADD COLUMN "tomadorNome" TEXT NOT NULL DEFAULT '';
ALTER TABLE "NotaFiscal" ADD COLUMN "tomadorDocumento" TEXT;
ALTER TABLE "NotaFiscal" ADD COLUMN "idDps" TEXT;
ALTER TABLE "NotaFiscal" ADD COLUMN "erros" JSONB;
ALTER TABLE "NotaFiscal" ADD COLUMN "motivoCancelamento" TEXT;
ALTER TABLE "NotaFiscal" ADD COLUMN "eventoXml" TEXT;
ALTER TABLE "NotaFiscal" ADD COLUMN "criadoPorId" TEXT;
ALTER TABLE "NotaFiscal" ADD COLUMN "assinadaPorId" TEXT;
ALTER TABLE "NotaFiscal" ADD COLUMN "assinadaEm" TIMESTAMP(3);
ALTER TABLE "NotaFiscal" ADD COLUMN "envioCliente" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "NotaFiscal" ADD COLUMN "enviadaClienteEm" TIMESTAMP(3);
ALTER TABLE "NotaFiscal" ADD COLUMN "arquivoId" TEXT;
CREATE UNIQUE INDEX "NotaFiscal_idDps_key" ON "NotaFiscal"("idDps");
