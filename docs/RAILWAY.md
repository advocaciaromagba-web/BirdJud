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
  encerrou ha mais tempo que o prazo de retencao;
- `npm run espalhar CAPTURAR_PUBLICACOES` — de madrugada, busca no DJEN as
  publicacoes das OABs monitoradas;
- `npm run espalhar AVISAR` — logo depois da captura, manda o resumo das
  publicacoes e os lembretes de compromisso. A ordem importa: avisar antes de
  capturar manda o resumo de ontem;
- `npm run espalhar SINCRONIZAR_COBRANCAS` — uma ou duas vezes por dia,
  confere no Asaas o que foi pago e da baixa.

## O que existe hoje no Railway (23/09/2026)

Projeto **birdjud**, ambiente **production**, na conta pessoal. Montado pela API
do Railway, nao a mao — o que esta aqui e o retrato do que foi criado.

| Servico | O que e | Detalhe |
|---|---|---|
| `postgres` | PostgreSQL 16 (imagem oficial do Railway, com SSL) | volume proprio em `/var/lib/postgresql/data`; banco `birdjud` pertencente a `birdjud_owner` |
| `aplicacao` | a aplicacao web, do repositorio, branch `main` | volume em `/dados/arquivos`; healthcheck em `/api/saude`; start `npm run start:producao` |
| `trabalhador` | consome a fila | start `npm run trabalhador`, reinicio sempre |
| `cron-noturno` | `0 3 * * *` (00h de Brasilia) | captura do DJEN e, em seguida, os avisos — nessa ordem |
| `cron-diario` | `0 9 * * *` (06h de Brasilia) | consumo, regua de cobranca e sincronizacao de cobrancas |
| `cron-semanal` | `0 6 * * 0` (domingo, 03h de Brasilia) | purga dos escritorios encerrados |

Os horarios do cron do Railway sao em **UTC**; os da tabela ja estao
convertidos.

### Como os papeis do banco foram criados

A API do Railway nao cria proxy TCP publico, entao o banco nao e alcancavel de
fora. Os tres papeis foram criados **por dentro**: um servico temporario, com a
mesma imagem do Postgres, rodou o SQL uma vez e foi apagado em seguida — ele
era o unico lugar com a URL de superusuario.

Conferido na saida: `birdjud_app` e `birdjud_owner` sem superusuario e sem
BYPASSRLS, `birdjud_plataforma` como unico com BYPASSRLS.

### A conferencia roda no start, e falha fechado

`npm run conferir-producao` faz parte de `start:producao`, depois das migracoes
e do RLS e **antes** de a aplicacao servir. Erro trava a subida; aviso passa.

Ela nao ficou no **preDeployCommand** do Railway por um motivo descoberto na
pratica: o pre-deploy roda em um container **sem os volumes montados**, e a
conferencia acusava, corretamente, que `/dados/arquivos` nao aceitava escrita.
No start o volume esta la, e o teste diz a verdade.

Uma aplicacao que nao sobe chama atencao; uma que sobe com o isolamento
quebrado, nao. Por isso falha fechado.

### O dominio, e o CNAME que nao existe na raiz

O Railway pede um CNAME na **raiz** (`@`) para `birdjud.com.br`. Isso nao e
possivel: o padrao DNS proibe CNAME convivendo com os registros que toda raiz
de dominio tem (SOA e NS). Nao e limitacao do Registro.br — e de qualquer DNS.

Por isso a plataforma atende em **`app.birdjud.com.br`**, e nao na raiz. O
codigo ja tratava `app` como reservado (`src/lib/subdominio.ts`), junto com
`www`, `api`, `admin` e `painel`: ele cai na tela da plataforma em vez de virar
slug de escritorio.

No Registro.br, dois registros resolvem tudo:

| Tipo | Nome | Valor |
|---|---|---|
| CNAME | `*` | o alvo que o Railway mostrar para `*.birdjud.com.br` |
| CNAME | `_acme-challenge` | o alvo `...authorize.railwaydns.net` do mesmo painel |

O curinga cobre `app.birdjud.com.br` e o subdominio de cada escritorio. O
segundo registro e o que permite emitir o certificado do curinga — sem ele,
`https://<escritorio>.birdjud.com.br` nao fecha cadeado.

O dominio da raiz continua cadastrado no Railway, pendente. Se um dia o DNS for
para um provedor que achata CNAME na raiz (a Cloudflare faz isso de graca), ele
passa a funcionar sozinho, sem mexer em nada aqui.

### O que ainda falta para um escritorio entrar

Os dominios ja estao cadastrados no servico `aplicacao`; falta o DNS apontar.
Enquanto os dois CNAMEs acima nao existirem no Registro.br, escritorio nenhum
entra — cada um atende no proprio subdominio.

## Antes de deixar o primeiro escritorio entrar

```bash
npm run conferir-producao
```

Ele confere, no ambiente de verdade: as variaveis obrigatorias, o tamanho da
chave de cifra, se os **tres papeis do banco sao mesmo tres**, se o usuario da
aplicacao nao e superusuario nem tem BYPASSRLS, se o RLS esta ligado **e
forcado** em todas as tabelas de escritorio, se as migracoes terminaram, e se o
volume dos arquivos aceita escrita. Termina com a prova que importa: **sem
contexto de escritorio, nenhuma linha e visivel**.

Cada item ali e um jeito conhecido de o deploy parecer certo e estar errado —
o sistema sobe, a tela abre, e o problema so aparece como dado de um escritorio
na tela de outro. Erro trava o comando com codigo 1; aviso passa, mas diz o que
deixa de funcionar.

## Healthcheck

Aponte o healthcheck do servico para **`/api/saude`**. Ele consulta o banco
antes de responder: aplicacao que responde com o banco fora do ar da deploy
verde e tela de erro para o escritorio. Responde `200 {"ok":true}` ou `503`, e
nada alem disso — e endereco publico.

> **O modulo de nuvem precisa de um VOLUME.** Disco de container e efemero: sem
> volume montado no caminho de `RAIZ_ARQUIVOS`, os arquivos do escritorio somem
> no proximo deploy. No Railway: servico da aplicacao > Settings > Volumes,
> montar em `/dados/arquivos` e apontar `RAIZ_ARQUIVOS` para la. O trabalhador
> nao precisa do volume; so a aplicacao web.

> **A API do DJEN bloqueia acesso de fora do Brasil.** Quem resolve isso e o
> rele da Vercel, fixado na regiao gru1 (Sao Paulo): configure `DJEN_RELE_URL` e
> `DJEN_RELE_TOKEN` no ambiente e o trabalhador pode rodar em qualquer regiao.
> Sem o rele, a captura so funciona de regiao brasileira, ou falha com 403.
> Passo a passo em [RELE-DJEN.md](RELE-DJEN.md).

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
