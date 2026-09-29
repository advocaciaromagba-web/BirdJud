# Backup e restauracao

> Backup que nunca foi restaurado nao e backup, e esperanca. O ensaio de
> restauracao esta no fim deste documento, e foi feito — com dois tropecos que
> so aparecem fazendo.

## Como roda

Servico `cron-backup` no Railway, todo dia as **02h de Brasilia** (05:00 UTC),
com **volume proprio** montado em `/backups`. O volume e separado do volume da
aplicacao e do volume do Postgres de proposito: backup no mesmo disco do banco
nao protege contra perder o disco.

```
npm run backup:banco
```

Faz `pg_dump` do banco inteiro, comprime em gzip, confere o que gravou e apaga
o que passou de `BACKUP_DIAS` (14, por padrao). O mais recente nunca e apagado,
mesmo que o relogio do container esteja errado.

## Duas armadilhas que este script ja evita

### 1. O RLS bloqueia o proprio `pg_dump`

As tabelas de escritorio tem RLS com **FORCE**, que vale inclusive para o dono
das tabelas. Rodando o dump com o papel de migracao, ele para na primeira:

```
ERROR: query would be affected by row-level security policy for table "AceiteDeTermos"
```

Pior seria "resolver" ignorando o erro: sairia um arquivo com o esquema inteiro
e **sem uma linha de dado** — um backup que so mostra o que e no dia da
restauracao. Por isso o dump roda com `DATABASE_URL_PLATAFORMA`, o papel que
tem `BYPASSRLS` para as tarefas do plano de controle.

### 2. Tamanho nao prova nada — nem para mais, nem para menos

Depois de gravar, o script abre o arquivo e confere tres coisas: que existe a
marca de fim do `pg_dump`, que ha mais de 20 `CREATE TABLE` e que ha **pelo
menos uma linha de dado**. Falhando qualquer uma, apaga o arquivo e sai com
erro — em vez de guardar um arquivo que parece backup.

O piso de bytes ficou baixo de proposito (1 KB), so para pegar arquivo vazio
ou truncado. A primeira execucao em producao foi recusada por um piso de 10 KB:
o banco, com um escritorio de teste, cabe em 9 KB comprimido. Alarme falso em
backup e pior que silencio, porque ensina a ignorar o alarme.

## Restaurar

O dump sai com `--clean --if-exists --no-owner --no-privileges`: aplica-se
sobre um banco existente sem exigir que alguem apague tudo antes, que e
exatamente o momento em que restauracao da errado.

```bash
gunzip -c birdjud-2026-09-25T14-16.sql.gz | psql "$DATABASE_URL_MIGRACAO"
npm run rls:aplicar
```

**A segunda linha nao e opcional.** Como o dump sai sem privilegios, o banco
restaurado fica sem os GRANTs para `birdjud_app` e `birdjud_plataforma`: a
aplicacao sobe e responde "permission denied" em tudo. `rls:aplicar` devolve os
GRANTs e reativa as politicas.

E uma observacao que confunde na primeira vez: **logo apos restaurar, contar
linhas com o papel de migracao devolve zero**. Nao e backup vazio — e o RLS
fazendo o que deve. Para conferir, use o papel da plataforma:

```bash
psql "$DATABASE_URL_PLATAFORMA" -c 'SELECT count(*) FROM "Escritorio"'
```

## O ensaio ja feito (25/09/2026)

Banco local, backup gerado pelo script, restaurado em um banco vazio
(`birdjud_prova`):

| tabela | linhas recuperadas |
| --- | --- |
| Escritorio | 3 |
| Cliente | 6 |
| Usuario | 3 |
| Processo | 4 |
| Publicacao | 4 |

Zero erros na aplicacao do dump. Os dois tropecos acima apareceram aqui, e nao
em producao.

## O que este backup ainda NAO e

**Nao sai do Railway.** Protege contra o acidente mais comum — exclusao errada,
migracao ruim, alguem apagando o que nao devia — e nao contra perder o projeto
ou a conta.

Para virar backup de verdade falta um destino externo (S3, Backblaze B2,
Storage Box) e uma copia diaria para la. O script ja esta preparado: e um passo
a mais depois do `console.log`, e as credenciais entram como variaveis do
servico `cron-backup`. Falta escolher o destino.

## Conferir que rodou

No Railway, servico `cron-backup` > Deployments: cada execucao aparece com a
saida do script, que diz o arquivo, o tamanho, quantas tabelas e quantas linhas
foram gravadas, e quantos arquivos antigos foram apagados.


## A copia fora do Railway

O plano do Railway **nao faz backup nenhum** do volume (`maxBackupsCount: 0`).
Sem copia externa, o backup diario mora no mesmo provedor que ele deveria
proteger: um incidente la leva o banco e a copia junto, e o ensaio de
restauracao nao serve de nada sem de onde restaurar.

Desde 29/09/2026 o `backup:banco` tambem envia para armazenamento compativel
com S3 — **Cloudflare R2** ou **Backblaze B2**, tanto faz: o codigo fala o
protocolo, nao o fornecedor. Trocar de um para o outro e trocar duas
variaveis.

### Variaveis (no servico cron-backup)

```
BACKUP_S3_ENDERECO=https://<conta>.r2.cloudflarestorage.com
BACKUP_S3_BALDE=birdjud-backup
BACKUP_S3_CHAVE=<access key id>
BACKUP_S3_SEGREDO=<secret access key>
BACKUP_S3_REGIAO=auto          # R2 usa "auto"; a B2 usa a regiao dela
BACKUP_CHAVE=<32 bytes em base64>
```

`BACKUP_CHAVE` sai de `openssl rand -base64 32`.

### A regra que nao se quebra

**A BACKUP_CHAVE tem de existir FORA do Railway.** Backup cifrado sem a chave
e lixo. Se o Railway sumir com o banco, com a copia e com a chave ao mesmo
tempo, a copia externa nao serviu para nada — guarde-a em gerenciador de
senhas, ou impressa em pasta, ou nos dois.

### Por que cifrado, e por que falha fechada

O dump leva nome, CPF e processo de cliente de todos os escritorios. Nao vai
em claro para balde de terceiro — nao por desconfianca do fornecedor, mas
porque uma chave de acesso vazada nao pode virar vazamento de dado de
cliente.

Sem `BACKUP_CHAVE`, o backup **falha** em vez de enviar em claro. Mandar dado
de cliente sem cifra precisa ser decisao consciente (`BACKUP_SEM_CIFRA=1`), e
nao o que acontece quando alguem esquece uma variavel.

Do mesmo jeito, configuracao pela metade levanta erro dizendo o que falta:
o pior estado possivel e parecer configurado e nao copiar nada.

### Trazer de volta

```
npm run restaurar-copia                      # lista o que existe la
npm run restaurar-copia -- banco/birdjud-....sql.gz.cifrado
gunzip -c birdjud-....sql.gz | psql "$DATABASE_URL_MIGRACAO"
npm run rls:aplicar                          # o dump nao traz privilegios
```

O ultimo passo nao e opcional: `pg_dump --no-privileges` nao carrega as
politicas, e um banco restaurado sem `rls:aplicar` fica **sem isolamento entre
escritorios**.

### O que foi provado, e o que nao foi

Provado em 29/09/2026 contra um servidor S3 local: dump, cifra, envio
assinado, conferencia do tamanho no destino, download, decifra — e o arquivo
que voltou e **byte a byte identico** ao dump original, com as 27 tabelas.

Nao provado ainda: o mesmo ciclo contra o R2 de verdade. Isso so acontece
quando as credenciais entrarem no Railway — e e o primeiro teste a fazer
depois disso, nao o ultimo.
