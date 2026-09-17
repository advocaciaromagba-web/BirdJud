-- ---------------------------------------------------------------------------
-- BirdJud — papeis de banco. Rodar UMA vez, como superusuario, antes da
-- primeira migracao. No Railway: aba Postgres > Data > Query, ou
-- `psql "$DATABASE_URL" -f scripts/preparar-banco.sql`.
--
-- O RLS so vale se a aplicacao NAO conectar como dono nem como superusuario:
-- superusuario ignora RLS sempre, e o dono ignoraria se nao fosse o
-- FORCE ROW LEVEL SECURITY de prisma/rls.sql.
--
-- Trocar as senhas antes de rodar.
-- ---------------------------------------------------------------------------

-- 1. Dono das tabelas: migracoes e prisma/rls.sql. A aplicacao nunca usa.
CREATE ROLE birdjud_owner LOGIN PASSWORD 'TROCAR_owner' NOSUPERUSER NOBYPASSRLS;

-- 2. Aplicacao: sujeita ao RLS. E a conexao de DATABASE_URL.
CREATE ROLE birdjud_app LOGIN PASSWORD 'TROCAR_app' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- 3. Plano de controle: cadastro de escritorio, painel do operador e rotinas
--    que percorrem escritorios. Unico papel que atravessa o RLS — usado so
--    por prismaPlataforma, nunca a partir de uma rota de escritorio.
CREATE ROLE birdjud_plataforma LOGIN PASSWORD 'TROCAR_plataforma' NOSUPERUSER BYPASSRLS;

-- O dono precisa ser membro de birdjud_plataforma para poder transferir a ela
-- a posse da view EscritorioPublico em prisma/rls.sql.
GRANT birdjud_plataforma TO birdjud_owner;

-- Banco pertencente ao dono.
-- (No Railway o banco ja existe; nesse caso rode apenas o ALTER abaixo.)
CREATE DATABASE birdjud OWNER birdjud_owner;
-- ALTER DATABASE railway OWNER TO birdjud_owner;
