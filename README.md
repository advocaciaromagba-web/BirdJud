# BirdJud

Sistema juridico **white label multi-tenant** para escritorios de advocacia de
ate 50 profissionais. Cada escritorio tem sua marca, seus dados isolados e paga
pelos modulos que contrata e pela faixa de advogados.

> **Produto independente.** O BirdJud nao compartilha banco, repositorio,
> credencial, conta de integracao, fila ou webhook com nenhum outro sistema. O
> unico reaproveitamento e de arquitetura — modelagem, padroes de codigo e
> desenho das rotinas —, reescrita aqui. Ver `docs/ARQUITETURA.md`.

## Stack

Next.js 14 (App Router) · Prisma 5 · PostgreSQL (com Row Level Security) ·
NextAuth · Tailwind · Vitest.

## Estado atual

**Fase 0 concluida** — base do projeto, schema multi-tenant, as duas travas de
isolamento e a bateria de teste. **Fase 1 em aberto** — autenticacao, telas do
nucleo e cobertura da bateria em todas as rotas.

## Como rodar

```bash
npm install
cp .env.example .env        # preencher; so variaveis da plataforma
npm run prisma:migrate      # cria o schema (usuario dono do banco)
npm run rls:aplicar         # aplica prisma/rls.sql (usuario dono do banco)
npm run dev
```

Gerar a chave de criptografia das credenciais:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Dois usuarios de banco

O RLS so vale se o usuario da aplicacao nao for dono das tabelas:

```sql
CREATE ROLE birdjud_owner LOGIN PASSWORD '...';   -- migracoes e rls.sql
CREATE ROLE birdjud_app   LOGIN PASSWORD '...';   -- aplicacao, sem DDL
```

`DATABASE_URL` aponta para `birdjud_app`; `DATABASE_URL_MIGRACAO` para
`birdjud_owner`.

## Testes

```bash
npm run teste              # tudo
npm run teste:isolamento   # bateria de isolamento entre escritorios
```

A bateria de isolamento **roda antes de todo deploy**. Sem `DATABASE_URL` ela e
pulada — em CI, o banco de teste e obrigatorio.

## Mapa do codigo

| Caminho | Papel |
| --- | --- |
| `prisma/schema.prisma` | Schema multi-tenant; toda entidade com `escritorioId` |
| `prisma/rls.sql` | Trava 2: politicas de RLS e view `EscritorioPublico` |
| `src/lib/contexto.ts` | Escritorio da requisicao (AsyncLocalStorage) |
| `src/lib/prisma.ts` | Trava 1: extensao do Prisma + `comEscritorio()` |
| `src/lib/escritorio.ts` | Subdominio, marca e configuracao do escritorio |
| `src/lib/modulos.ts` | Ponto unico de modulo contratado |
| `src/lib/integracao.ts` | Credenciais por escritorio |
| `src/lib/segredo.ts` | AES-256-GCM das credenciais |
| `testes/isolamento.test.ts` | Bateria de isolamento |

## Regras de contribuicao

1. Nenhuma consulta de negocio fora de `comEscritorio()`.
2. Nenhuma credencial de escritorio em variavel de ambiente.
3. Nenhum nome, telefone, cidade, endereco ou cor de escritorio fixo no codigo.
4. Toda rota nova entra tambem na bateria de isolamento.
5. Nenhum arquivo, dado ou dependencia vindo de outro sistema.
