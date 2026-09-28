-- Senha de administracao do escritorio: a segunda porta, para o financeiro e
-- para as acoes destrutivas (apagar usuario, subir certificado, assinar nota).
--
-- Nula ate o escritorio definir. Enquanto for nula, a area de administracao
-- pede para defini-la em vez de deixar entrar — nao existe "sem senha, passa".
ALTER TABLE "Escritorio" ADD COLUMN IF NOT EXISTS "senhaAdminHash" TEXT;

-- Quando a senha foi trocada pela ultima vez. Serve para o escritorio saber, e
-- para o aviso de "ninguem definiu ainda" nao depender de adivinhacao.
ALTER TABLE "Escritorio" ADD COLUMN IF NOT EXISTS "senhaAdminEm" TIMESTAMP(3);
