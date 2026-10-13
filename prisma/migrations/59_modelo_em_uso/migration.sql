-- O escritorio escolhe qual modelo vale: o dele ou o do sistema.
--
-- Antes, "voltar ao do sistema" apagava o arquivo enviado. Agora o modelo do
-- escritorio fica guardado (ativo) e "emUso" diz se e ele que sai na peca ou
-- o do sistema — trocar de um para o outro e um clique, nos dois sentidos.
ALTER TABLE "ModeloDeDocumento" ADD COLUMN IF NOT EXISTS "emUso" BOOLEAN NOT NULL DEFAULT true;
