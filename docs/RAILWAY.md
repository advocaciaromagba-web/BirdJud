# Deploy do BirdJud no Railway

Projeto proprio, banco proprio. Nenhum servico, banco ou variavel e
compartilhado com outro sistema — inclusive dentro da mesma conta Railway,
o BirdJud fica em um **projeto separado**.

## 1. Criar o projeto

1. Railway > **New Project** > **Empty Project**, nome `birdjud`.
2. **New** > **Database** > **PostgreSQL**.
3. **New** > **GitHub Repo** > `advocaciaromagba-web/BirdJud`.

## 2. Criar os tres papeis de banco

O PostgreSQL do Railway entrega um `DATABASE_URL` com o usuario **postgres**,
que e superusuario — e superusuario **ignora o RLS**. Usar essa conexao na
aplicacao anularia a trava 2 por inteiro.

Abra o servico Postgres > aba **Data** > **Query** (ou conecte com a URL
publica) e rode, trocando as senhas:

```sql
CREATE ROLE birdjud_owner      LOGIN PASSWORD '...' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE birdjud_app        LOGIN PASSWORD '...' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE ROLE birdjud_plataforma LOGIN PASSWORD '...' NOSUPERUSER BYPASSRLS;

GRANT birdjud_plataforma TO birdjud_owner;

-- No Railway o banco ja existe e se chama "railway".
ALTER DATABASE railway OWNER TO birdjud_owner;
ALTER SCHEMA public OWNER TO birdjud_owner;
```

| Papel | Para que serve | RLS |
| --- | --- | --- |
| `birdjud_owner` | migracoes e `prisma/rls.sql` | sujeito (`FORCE`) |
| `birdjud_app` | a aplicacao | sujeito |
| `birdjud_plataforma` | cadastro de escritorio, painel do operador, rotinas | **atravessa** (`BYPASSRLS`) |

## 3. Variaveis do servico da aplicacao

Use a rede privada (`postgres.railway.internal`), nao a URL publica:

```
DATABASE_URL=postgresql://birdjud_app:SENHA@postgres.railway.internal:5432/railway
DATABASE_URL_MIGRACAO=postgresql://birdjud_owner:SENHA@postgres.railway.internal:5432/railway
DATABASE_URL_PLATAFORMA=postgresql://birdjud_plataforma:SENHA@postgres.railway.internal:5432/railway
NEXTAUTH_URL=https://app.birdjud.com.br
NEXTAUTH_SECRET=...
SEGREDO_CHAVE=...
DOMINIO_PLATAFORMA=birdjud.com.br
ASAAS_WEBHOOK_TOKEN=...
```

`ASAAS_WEBHOOK_TOKEN` e o token do webhook de pagamento **da plataforma** (a
baixa automatica das faturas dos escritorios). Cadastre o mesmo valor no Asaas,
em Integracoes > Webhooks, apontando para
`https://app.birdjud.com.br/api/webhooks/asaas`. Sem ele, a rota responde 503 e
a baixa continua manual, pelo painel do operador.

Gerar os dois segredos:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> `SEGREDO_CHAVE` cifra as credenciais de todos os escritorios. Perde-la
> significa perder o acesso a todas as integracoes conectadas. Guarde uma copia
> fora do Railway.

## 4. Deploy

`railway.json` ja define tudo:

- **build**: `npm run build` (`prisma generate` + `next build`);
- **start**: `npm run start:producao`, que roda `prisma migrate deploy` como
  dono, aplica `prisma/rls.sql` (idempotente) e so entao sobe o Next.

Se a migracao ou o RLS falharem, o processo morre e o Railway nao promove a
versao — de proposito: **nunca** subir a aplicacao com o RLS desatualizado.

## 4b. O trabalhador da fila

A fila precisa de um processo separado do site. No mesmo projeto Railway:

1. **New** > **GitHub Repo** > o mesmo repositorio;
2. em **Settings** > **Deploy** > Start Command: `npm run trabalhador`;
3. as mesmas variaveis do servico web (ele usa `DATABASE_URL_PLATAFORMA`);
4. sem dominio publico: o trabalhador nao atende HTTP.

Para agendar as rotinas, crons do Railway chamando:

- `npm run espalhar APURAR_CONSUMO` — todo dia de madrugada, mede o consumo;
- `npm run espalhar REGUA_DE_COBRANCA` — todo dia, gera fatura do mes, marca
  atraso e suspende quem passou do prazo;
- `npm run espalhar PURGAR_ENCERRADOS` — semanal, apaga os dados de quem
  encerrou ha mais tempo que o prazo de retencao.

O espalhamento cria um trabalho por escritorio; o trabalhador consome. Sem esse
cron a regua nao roda, e ninguem e faturado nem suspenso.

Mais de um trabalhador pode rodar ao mesmo tempo: a reclamacao usa
`FOR UPDATE SKIP LOCKED` e a regra de um trabalho por escritorio vale entre
todos eles.

## 5. Dominio e subdominios

Cada escritorio atende em `<slug>.birdjud.com.br`, entao o servico precisa de um
**dominio curinga**:

1. Railway > servico > **Settings** > **Networking** > **Custom Domain**;
2. cadastrar `*.birdjud.com.br` (e `app.birdjud.com.br` para a plataforma);
3. no DNS, um CNAME curinga apontando para o destino que o Railway mostrar.

Sem o curinga, so o dominio cadastrado responde e os escritorios ficam sem
endereco proprio.

## 6. Antes de cada deploy

O CI (`.github/workflows/ci.yml`) roda `npm run teste:isolamento` contra um
PostgreSQL de verdade, com os tres papeis. **Deploy com a bateria vermelha nao
acontece.** Em Settings > Deploy, deixe o deploy condicionado ao CI verde.

## 7. Backup

O backup do Railway e do banco inteiro, com todos os escritorios juntos. Ele
resolve a perda do banco, mas nao o caso mais comum: um escritorio que precisa
voltar ao estado de ontem sem afetar os outros.

Para isso ha o backup **por escritorio**:

```bash
npm run backup -- <slug> backup.json
npm run restaurar -- backup.json <slug-novo>   # nasce SUSPENSO
```

O procedimento e testado na bateria automatica, restaurando ao lado do original
e conferindo registro a registro (`testes/fase5.test.ts`).

**O que ainda falta na infraestrutura:** agendar esse backup e guardar o arquivo
fora do Railway. O arquivo carrega credenciais cifradas — trate-o como o banco.
