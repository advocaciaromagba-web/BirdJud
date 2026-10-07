-- A chave estrangeira da triagem para a publicacao.
--
-- Em migracao propria, e nao dentro da 41, porque a 41 ja rodou: migracao
-- aplicada nao se edita — o Prisma guarda o resumo de cada uma e recusa o
-- deploy inteiro quando o arquivo muda debaixo dele.
--
-- ON DELETE CASCADE: publicacao arquivada e apagada leva a sugestao junto.
-- Sugestao orfa apontando para publicacao que nao existe mais so apareceria
-- na tela como linha sem texto.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'TriagemDePublicacao_publicacaoId_fkey'
  ) THEN
    ALTER TABLE "TriagemDePublicacao"
      ADD CONSTRAINT "TriagemDePublicacao_publicacaoId_fkey"
      FOREIGN KEY ("publicacaoId") REFERENCES "Publicacao"("id") ON DELETE CASCADE;
  END IF;
END
$$;
