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

-- Escritorio: a propria linha do escritorio tambem so e visivel para ele.
ALTER TABLE "Escritorio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Escritorio" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "isolamento_Escritorio" ON "Escritorio";
CREATE POLICY "isolamento_Escritorio" ON "Escritorio"
  USING ("id" = current_setting('app.escritorio_id', true))
  WITH CHECK ("id" = current_setting('app.escritorio_id', true));

-- Permissoes do usuario da aplicacao (sem DDL, sem BYPASSRLS).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO birdjud_app;
GRANT USAGE ON SCHEMA public TO birdjud_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO birdjud_app;

-- ---------------------------------------------------------------------------
-- Resolucao de subdominio e marca ANTES de existir sessao.
--
-- Com RLS estrito em "Escritorio", nem a tela de login conseguiria descobrir
-- qual escritorio atende <slug>.birdjud.com.br. Em vez de afrouxar a politica,
-- expomos uma VIEW so com as colunas de marca. A view roda com os privilegios
-- do dono (security_invoker = false, padrao), entao nao passa pelo RLS — e por
-- isso ela nao pode ganhar nenhuma coluna de dado de negocio.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW "EscritorioPublico" AS
  SELECT "id", "slug", "nome", "status", "logoUrl", "corPrimaria", "corSecundaria",
         "telefoneAtendimento", "cidade"
  FROM "Escritorio";

GRANT SELECT ON "EscritorioPublico" TO birdjud_app;
