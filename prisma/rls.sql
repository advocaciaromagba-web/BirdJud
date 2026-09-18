-- ---------------------------------------------------------------------------
-- BirdJud — Trava 2: Row Level Security no PostgreSQL.
--
-- Rodar com o usuario DONO das tabelas (DATABASE_URL_MIGRACAO), depois de
-- cada "prisma migrate". A aplicacao conecta com um usuario SEM privilegio
-- (birdjud_app), que nao e dono das tabelas nem superusuario.
--
-- FORCE ROW LEVEL SECURITY garante que nem o dono escapa da politica.
-- current_setting('app.escritorio_id', true) e definido por transacao em
-- src/lib/prisma.ts — tem de estar na MESMA transacao da consulta por causa
-- do pool de conexoes.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'ModuloContratado',
    'Integracao',
    'ConsumoMensal',
    'Usuario',
    'Cliente',
    'Processo',
    'Compromisso',
    'Lancamento',
    'Assinatura',
    'Fatura',
    'AceiteDeTermos',
    'AcessoSuporte'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'isolamento_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING ("escritorioId" = current_setting(''app.escritorio_id'', true)) '
      'WITH CHECK ("escritorioId" = current_setting(''app.escritorio_id'', true))',
      'isolamento_' || t, t
    );
  END LOOP;
END
$$;

-- Trabalho tem escritorioId NULO nos trabalhos da plataforma. A politica
-- compara com o escritorio da sessao, entao a aplicacao ve so os seus e nunca
-- os da plataforma (NULL = ... nao e verdadeiro). O trabalhador roda com
-- birdjud_plataforma e enxerga todos.
ALTER TABLE "Trabalho" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Trabalho" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "isolamento_Trabalho" ON "Trabalho";
CREATE POLICY "isolamento_Trabalho" ON "Trabalho"
  USING ("escritorioId" = current_setting('app.escritorio_id', true))
  WITH CHECK ("escritorioId" = current_setting('app.escritorio_id', true));

-- Escritorio: a propria linha do escritorio tambem so e visivel para ele.
ALTER TABLE "Escritorio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Escritorio" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "isolamento_Escritorio" ON "Escritorio";
CREATE POLICY "isolamento_Escritorio" ON "Escritorio"
  USING ("id" = current_setting('app.escritorio_id', true))
  WITH CHECK ("id" = current_setting('app.escritorio_id', true));

-- Permissoes.
--   birdjud_app        — aplicacao, sujeita ao RLS, sem DDL.
--   birdjud_plataforma — plano de controle (BYPASSRLS): cadastro de escritorio,
--                        painel do operador e rotinas que percorrem escritorios.
GRANT USAGE ON SCHEMA public TO birdjud_app, birdjud_plataforma;
-- CREATE no schema e necessario para birdjud_plataforma poder ser DONA da view
-- EscritorioPublico (ver o bloco no fim deste arquivo). Nenhum dos dois papeis
-- roda DDL em tempo de execucao — migracoes sao sempre de birdjud_owner.
GRANT CREATE ON SCHEMA public TO birdjud_plataforma;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO birdjud_app, birdjud_plataforma;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO birdjud_app, birdjud_plataforma;

-- ---------------------------------------------------------------------------
-- Resolucao de subdominio e marca ANTES de existir sessao.
--
-- Com RLS estrito em "Escritorio", nem a tela de login conseguiria descobrir
-- qual escritorio atende <slug>.birdjud.com.br. Em vez de afrouxar a politica,
-- expomos uma VIEW so com as colunas de marca.
--
-- A view precisa PERTENCER a birdjud_plataforma: uma view roda com os
-- privilegios do dono (security_invoker = false, o padrao), e birdjud_owner
-- tambem esta sob FORCE ROW LEVEL SECURITY — se a view fosse dele, devolveria
-- zero linhas e a tela de login ficaria sem marca.
--
-- Como ela atravessa o RLS, NAO acrescentar nenhuma coluna de dado de negocio
-- aqui. So marca.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW "EscritorioPublico" AS
  SELECT "id", "slug", "nome", "status", "logoUrl", "corPrimaria", "corSecundaria",
         "telefoneAtendimento", "cidade"
  FROM "Escritorio";

ALTER VIEW "EscritorioPublico" OWNER TO birdjud_plataforma;
GRANT SELECT ON "EscritorioPublico" TO birdjud_app;
