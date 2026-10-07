-- O que um contrato e uma procuracao exigem do escritorio.
--
-- Ate aqui o sistema sabia o nome, o CNPJ e a cidade — o bastante para a tela,
-- nao para a peca. Um contrato de honorarios qualifica o CONTRATADO por
-- inteiro: razao social, CNPJ, registro de sociedade na OAB, o advogado que
-- representa com OAB, CPF e RG, e a sede. Faltando qualquer um, a peca sai com
-- um buraco no lugar de quem esta se obrigando.
ALTER TABLE "Escritorio" ADD COLUMN IF NOT EXISTS "razaoSocial" TEXT;
ALTER TABLE "Escritorio" ADD COLUMN IF NOT EXISTS "registroOab" TEXT;

-- Qualificacao do advogado, para a peca. Nao e cadastro de RH: e o que a
-- procuracao e o contrato precisam escrever por extenso.
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "cpf" TEXT;
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "rg" TEXT;
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "nacionalidade" TEXT;
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "estadoCivil" TEXT;
-- Quando o advogado tem sociedade unipessoal propria, que e o caso comum em
-- banca de dois socios: cada um assina pela sua.
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "sociedade" TEXT;
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "sociedadeCnpj" TEXT;
-- Entra na peca? Advogado que nao atua mais fica no sistema e sai do papel.
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "assinaPecas" BOOLEAN NOT NULL DEFAULT true;
