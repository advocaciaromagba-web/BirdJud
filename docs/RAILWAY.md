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
- `npm run espalhar GERAR_CONTAS_A_PAGAR` — todo dia, cria as contas do mes a
  partir das despesas fixas vigentes. Todo dia, e nao uma vez por mes, para a
  despesa cadastrada no dia 12 ja virar conta do mes corrente. Repetir nao
  duplica;
- `npm run espalhar AVISAR` — logo depois da captura, manda o resumo das
  publicacoes, os lembretes de compromisso e o vencimento de conta e de
  recebimento (so para ADMIN). A ordem importa duas vezes: avisar antes de
  capturar manda o resumo de ontem, e avisar antes de gerar as contas do mes
  deixa de avisar as que acabaram de nascer;
- `npm run espalhar SINCRONIZAR_COBRANCAS` — uma ou duas vezes por dia,
  confere no Asaas o que foi pago e da baixa;
- `npm run espalhar EMITIR_HONORARIOS` — todo dia, emite a parcela de contrato
  de honorarios que entrou na janela dos dez dias. So em contrato com emissao
  automatica ligada. Parcela travada por cadastro incompleto, ou ja vencida sem
  nunca ter sido emitida, nao e falha: fica na tela esperando decisao.

## O que existe hoje no Railway (23/09/2026)

Projeto **birdjud**, ambiente **production**, na conta pessoal. Montado pela API
do Railway, nao a mao — o que esta aqui e o retrato do que foi criado.

| Servico | O que e | Detalhe |
|---|---|---|
| `postgres` | PostgreSQL 16 (imagem oficial do Railway, com SSL) | volume proprio em `/var/lib/postgresql/data`; banco `birdjud` pertencente a `birdjud_owner` |
| `aplicacao` | a aplicacao web, do repositorio, branch `main` | volume em `/dados/arquivos`; healthcheck em `/api/saude`; start `npm run start:producao` |
| `trabalhador` | consome a fila | start `npm run trabalhador`, reinicio sempre |
| `cron-noturno` | `0 3 * * *` (00h de Brasilia) | captura do DJEN, contas a pagar do mes e, em seguida, os avisos — nessa ordem |
| `cron-diario` | `0 9 * * *` (06h de Brasilia) | consumo, regua de cobranca, sincronizacao de cobrancas e emissao de parcela de honorarios |
| `cron-semanal` | `0 6 * * 0` (domingo, 03h de Brasilia) | purga dos escritorios encerrados |
| `cron-horario` | `7 * * * *` (de hora em hora) | `LEMBRAR`: so os lembretes de compromisso |

**Por que existe um cron de hora em hora.** A regua de lembretes tem um marco
de UMA HORA antes (ver `src/lib/regua-de-lembretes.ts`), e marco de uma hora
com rotina diaria nunca dispara. O `LEMBRAR` e so a geracao e o envio dos
lembretes: rodar o `AVISAR` inteiro de hora em hora arrastaria junto o resumo
do dia e o financeiro, que sao do dia e nao da hora — e qualquer um deles
falhando derrubaria o lembrete da audiencia que comeca em quarenta minutos.

O minuto 7, e nao o 0, e de proposito: no minuto cheio todo mundo agenda, e a
fila do provedor atrasa.

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

### O registro TXT de verificacao (facil de esquecer)

Alem do CNAME curinga e do `_acme-challenge`, o Railway so passa a **rotear** o
dominio depois que a posse e confirmada por um registro TXT:

    _railway-verify.birdjud.com.br   TXT   railway-verify=<token do dominio>

O token aparece em `customDomain.status.verificationToken` na API (e na tela do
dominio no Railway). Enquanto `status.verified` for `false`, acontece exatamente
isto: o HTTPS funciona (o certificado curinga e emitido), mas toda requisicao
volta `404 Application not found` da borda do Railway, porque nenhum servico
esta associado aquele Host.

Dois detalhes do DNS:

- o CNAME curinga `*` responde tambem por `_railway-verify`, entao sem o TXT
  explicito a consulta devolve o CNAME e a verificacao nunca conclui. Um
  registro criado no nome exato tem precedencia sobre o curinga, entao basta
  criar o TXT;
- no Cloudflare o registro precisa ficar como **Somente DNS** (sem proxy), como
  os demais.

Depois de criar o TXT, a verificacao costuma concluir em poucos minutos; o
`certificateStatus` sai de `VALIDATING_OWNERSHIP` e o dominio comeca a servir.

### A porta de destino

Verificado o dominio, o 404 vira `502 Application failed to respond` se a
`targetPort` do dominio nao for a porta em que a aplicacao escuta. Aqui o
`next start` sobe em **8080** (aparece no log do deploy, `Local:
http://localhost:8080`), entao os dois dominios ficam com `targetPort: 8080`.

### Estado em 24/09/2026

Funcionando, com certificado valido:

- `https://birdjud.com.br` (o apex; o Cloudflare achata o CNAME em A e, com a
  posse ja verificada, o Railway roteia assim mesmo);
- `https://app.birdjud.com.br` (a plataforma);
- `https://<slug>.birdjud.com.br` (cada escritorio).

Prova de ponta a ponta feita no ar: cadastro pelo endereco da plataforma,
login no subdominio do escritorio, sessao com o `escritorioId` certo e o
cookie preso ao subdominio (a mesma sessao nao vale em `app.birdjud.com.br`).

### Dominio proprio de escritorio: decidido que nao existe

O plano permite **2 dominios proprios**, e os dois estao em uso:
`birdjud.com.br` e `*.birdjud.com.br`. Nao cabe um terceiro.

Isso NAO e um limite a contornar: por decisao de produto (29/09/2026), todo
escritorio fica em subdominio da BirdJud — `escritorio.birdjud.com.br` —, e
nenhum usa dominio proprio. O curinga cobre todos os escritorios com um
dominio so, entao o teto de 2 nunca e alcancado por crescimento de clientes.

Fica escrito por dois motivos: para o limite nao ser lido como bloqueio numa
investigacao futura, e para ninguem construir suporte a dominio proprio de
escritorio achando que e lacuna. Se um dia a decisao mudar, ai sim e preciso
subir de plano — e o custo entra na conta do cliente que pediu.

### "Deploy Crashed" que nao e queda

Em 28/09/2026 chegou um aviso da Railway: *"Deployment crashed for aplicacao
in birdjud"*. O sistema nunca saiu do ar — o vigia, que bate de 5 em 5
minutos com tres tentativas, nao acusou nada em nenhum momento.

O que aconteceu: **mudar variavel na Railway ja dispara deploy sozinho**.
Quando alem disso se chama `serviceInstanceDeployV2`, nascem dois deploys no
mesmo minuto. Um deles perde a corrida e e morto no meio da inicializacao, e
e isso que a Railway chama de "crashed".

O rastro confirma: nos deploys da aplicacao ha exatamente tres pares no mesmo
minuto (24/09 15:29, 28/09 16:02 e 28/09 20:53), e os tres coincidem com os
momentos em que uma variavel foi gravada e um deploy foi pedido em seguida. O
perdedor de 20:53 nao imprimiu nenhuma linha de log — morreu antes de comecar.

**Entao: depois de `variableUpsert`, nao chame deploy.** A Railway ja esta
subindo. Chamar de novo custa build, e paga o preco pior — alarme falso
ensina a ignorar o alarme, e o proximo aviso de queda de verdade vai ser lido
como mais um destes.

Para conferir se um aviso desses e queda de verdade, em ordem:

1. o vigia acusou? Se nao acusou, ninguem ficou sem sistema;
2. `curl -o /dev/null -w "%{http_code}" https://app.birdjud.com.br/api/saude`;
3. o deploy atual tem mais de um "Starting Container" no log? Ai sim e
   reinicio em laco, e o motivo esta nas linhas anteriores.

### A cobranca da assinatura

`ASAAS_PLATAFORMA_CHAVE` no servico **aplicacao** e no **cron-diario**: e a
chave da conta Asaas DA BLACKBIRD, nao a de nenhum escritorio. As duas
existem e sao diferentes:

| conta | quem recebe | onde fica a chave |
| --- | --- | --- |
| do escritorio | o advogado, dos clientes dele | banco, cifrada (Integracao ASAAS) |
| da plataforma | a BirdJud, dos escritorios | `ASAAS_PLATAFORMA_CHAVE` |

Sem ela a regua continua gerando a fatura e ajustando o status, mas ninguem
cobra — e o escritorio seria suspenso por nao pagar uma fatura que nunca lhe
foi apresentada. O log avisa em toda passada.

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

## "Deploy Crashed!" que nao e queda

A Railway manda e-mail de *Deploy Crashed* a cada troca de versao do
`aplicacao`, e nenhuma dessas vezes houve queda. Vale saber separar, porque
alarme falso repetido ensina todo mundo a ignorar o alarme — e um dia o
e-mail vai ser de verdade, com a mesma cara.

O que acontece na troca: a versao nova sobe, passa o healthcheck, assume o
trafego, e so entao a antiga recebe SIGTERM. Em 04/10/2026, por exemplo:

    14:14:10  versao nova pronta e servindo
    14:14:13  versao antiga parada

Houve sobreposicao, nao buraco. O log da antiga mostrava exatamente isto:

    14:02:52  ✓ Ready in 217ms          <- estava servindo
    14:14:04  Stopping Container        <- SIGTERM da troca
    14:14:04  npm error signal SIGTERM  <- o npm chamando de erro

O problema era so o codigo de saida. Medido aqui, com o mesmo SIGTERM:

    next start                          -> 143
    npm run start                       -> 143
    exec node_modules/.bin/next start   -> 0

Sem `exec`, quem recebe o sinal e o shell (ou o npm), que morre pelo sinal e
sai 143 — e a Railway le qualquer saida diferente de zero como queda. Com
`exec`, o shell e SUBSTITUIDO pelo processo do Next, que trata o SIGTERM e
sai 0: parada limpa, sem e-mail.

Por isso o `startCommand` termina em `exec`. E por isso ele NAO comeca com
`npm run`. Medido, com um script que ja terminava em `exec`:

    npm run <script que termina em exec ...>  -> 143

Com o npm no topo, o `exec` la dentro nao adianta nada: quem recebe o sinal
e o npm, que morre pelo sinal e sai 143 do mesmo jeito. A cadeia tem de
estar inteira no `startCommand`, sem npm envolvendo o passo final.

E atencao a precedencia: o `startCommand` gravado NO SERVICO ganha do
`railway.json`. Mudar so o arquivo do repositorio nao muda nada em producao
— foi o que aconteceu na primeira tentativa desta correcao. Os dois precisam
dizer a mesma coisa; o `railway.json` fica como registro do que o servico
deve ter.

Nota: o `trabalhador` ainda sobe por `npm run trabalhador` e sai 143 na
troca. Ele nao dispara e-mail hoje, mas tem uma questao maior e separada —
o que acontece com o trabalho em andamento quando o sinal chega.
