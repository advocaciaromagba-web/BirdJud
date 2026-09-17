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

**Fase 0 concluida e verificada** — base do projeto, schema multi-tenant, as duas
travas de isolamento e a bateria de teste, rodadas contra um PostgreSQL 16 real:
`typecheck` limpo, `build` de producao OK, bateria de isolamento 10/10.

**Fase 1 em aberto** — autenticacao (NextAuth com escritorioId na sessao, 2FA),
middleware de subdominio, telas do nucleo e cobertura da bateria em cada rota
nova.

## Como rodar

```bash
npm install
cp .env.example .env        # preencher; so variaveis da plataforma
npm run migrar              # prisma migrate deploy como dono do banco
npm run rls:aplicar         # aplica prisma/rls.sql (idempotente)
npm run dev
```

Gerar a chave de criptografia das credenciais:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Tres papeis de banco

O RLS so vale se a aplicacao nao for dona das tabelas nem superusuario. Rode
`scripts/preparar-banco.sql` uma vez, como superusuario:

| Papel | Para que serve | Variavel | RLS |
| --- | --- | --- | --- |
| `birdjud_owner` | migracoes e `prisma/rls.sql` | `DATABASE_URL_MIGRACAO` | sujeito (`FORCE`) |
| `birdjud_app` | a aplicacao | `DATABASE_URL` | sujeito |
| `birdjud_plataforma` | cadastro de escritorio, painel do operador, rotinas | `DATABASE_URL_PLATAFORMA` | **atravessa** (`BYPASSRLS`) |

Deploy no Railway: `docs/RAILWAY.md`.

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
| `testes/isolamento.test.ts` | Bateria de isolamento (10 casos) |
| `scripts/preparar-banco.sql` | Cria os tres papeis; roda uma vez |
| `.github/workflows/ci.yml` | Roda a bateria contra Postgres real a cada push |

## Regras de contribuicao

1. Nenhuma consulta de negocio fora de `comEscritorio()`.
2. Nenhuma credencial de escritorio em variavel de ambiente.
3. Nenhum nome, telefone, cidade, endereco ou cor de escritorio fixo no codigo.
4. Toda rota nova entra tambem na bateria de isolamento.
5. Nenhum arquivo, dado ou dependencia vindo de outro sistema.
6. `prismaPlataforma()` atravessa o RLS — so no plano de controle, nunca em
   rota de escritorio.
