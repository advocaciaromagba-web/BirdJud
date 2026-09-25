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
