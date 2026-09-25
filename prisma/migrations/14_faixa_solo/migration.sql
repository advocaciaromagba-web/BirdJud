-- Faixa nova: o escritorio de um advogado so.
--
-- O padrao da coluna passa a ser ATE_1 porque e assim que todo escritorio
-- entra agora. Quem ja esta cadastrado nao muda de faixa: o valor dele esta
-- gravado na linha, e este ALTER so vale para linha nova.
ALTER TABLE "Escritorio" ALTER COLUMN "faixa" SET DEFAULT 'ATE_1';
