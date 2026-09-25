# Auditoria: o que falta para colocar o sistema em teste

Feita em 25/09/2026, contra o que esta em producao em `birdjud.com.br`.

Teste aqui quer dizer **escritorio de verdade usando com processo de
verdade**. E um patamar diferente de "o sistema funciona": o que um
escritorio nao perdoa e perder prazo, perder documento e nao conseguir
entrar.

Cada item diz quem resolve — `[nos]` e trabalho de codigo, `[voce]` depende de
uma decisao, uma credencial ou um contrato.

---

## Impedem o teste

### 1. ~~Nao existe recuperacao de senha~~ — FEITO, falta a credencial `[voce]`

O fluxo esta pronto e provado de ponta a ponta (`npm run conferir-recuperacao`):
link que vale uma vez e por uma hora, token guardado como hash, sessoes
abertas derrubadas na troca, resposta identica para conta que existe e que
nao existe.

Falta so ligar o remetente em producao: as variaveis `PLATAFORMA_SMTP_*` no
Railway. Ver `docs/EMAIL-DA-PLATAFORMA.md`. Enquanto elas nao existirem, a
tela diz que a recuperacao automatica nao esta disponivel — nao finge que o
e-mail saiu.

### 2. A captura do DJEN nao funciona de dentro do Railway `[nos + voce]`

`DJEN_RELE_URL` nao esta definida em producao. O DJEN recusa requisicao de
fora do Brasil e o Railway serve de fora; sem o rele na Vercel (regiao
`gru1`), a captura de publicacoes — que e o modulo que mais vende o produto —
nao traz nada.

O rele esta escrito e testado (`rele/`, 15 testes), mas nunca foi implantado.
Falta: publicar na Vercel, gerar o `RELE_TOKEN`, definir as duas variaveis no
Railway e rodar `npm run conferir-djen`.

### 3. A IA esta desligada em producao `[voce]`

`ANTHROPIC_API_KEY` nao esta definida. A leitura de documento, o resumo de
publicacao e a minuta respondem com uma mensagem honesta ("a plataforma ainda
nao configurou a chave de IA"), mas nao funcionam — e sao o que a pagina
inicial promete primeiro.

### 4. ~~Nao ha backup automatico do banco~~ — FEITO pela metade `[voce escolhe o destino]`

Existe agora um `pg_dump` diario as 02h de Brasilia, no servico `cron-backup`,
com volume proprio, retencao de 14 dias, conferencia do conteudo (nao so do
tamanho) e **ensaio de restauracao ja feito** — ver `docs/BACKUP.md`.

O que falta: **a copia sair do Railway**. Como esta, protege contra o acidente
mais comum (exclusao errada, migracao ruim) e nao contra perder o projeto ou a
conta. Falta escolher um destino externo (S3, Backblaze B2, Storage Box); o
resto ja esta pronto.

---

## Fazem falta antes do segundo escritorio

### 5. Usuario novo nao recebe convite `[nos]`

O administrador cria o usuario digitando uma senha e precisa passa-la por
fora (WhatsApp, papel, voz). Alem de ruim, e inseguro. O certo e convite por
e-mail com link de definicao de senha.

Agora e barato: o remetente da plataforma e o fluxo de token ja existem, e o
convite e o mesmo mecanismo com outro texto.

### 6. Nao existe cobranca automatica da assinatura `[nos + voce]`

A fatura da plataforma e gerada pela regua, mas quem marca como paga e um
operador, na mao (`/api/plataforma/faturas`). Para um piloto com poucos
escritorios isso e ate razoavel — e mais honesto do que cobrar cartao antes de
o produto se provar. Para o decimo escritorio, nao.

### 7. As minutas juridicas nao foram revisadas por advogado `[voce]`

Termos de uso, contrato de licenca e acordo de LGPD estao escritos e com
aceite registrado com data, hora, IP e versao — o mecanismo esta certo. O
**texto** e rascunho meu e precisa de leitura de quem assina.

### 8. Onboarding nao existe `[nos]`

Quem se cadastra cai no painel vazio. As pendencias ("cadastre uma OAB",
"conecte o e-mail") aparecem, o que ja ajuda, mas nao ha um caminho guiado de
primeira configuracao. Em piloto acompanhado de perto da para viver sem; em
autoatendimento, nao.

### 9. Nao ha monitoramento externo `[nos + voce]`

O `/api/saude` existe e o Railway reinicia o servico quando ele falha, mas
ninguem e avisado. Se o sistema cair as 2h de um sabado, quem descobre e o
escritorio na segunda. Um monitor externo batendo no healthcheck e um aviso
por e-mail ou WhatsApp resolvem em uma tarde.

### 10. Sem canal de contato configurado `[voce]`

`CONTATO_COMERCIAL` nao esta definida: a pagina de planos e a de contato
levam ao teste em vez de levarem a voce. Falta so o e-mail (ou WhatsApp) que
voce quer publicar.

---

## Ficam para depois do piloto

- **WhatsApp**: dois modelos aprovados na Meta e as credenciais do escritorio.
  O modulo esta pronto e testado, mas modelo nao aprovado nao envia.
- **NFS-e em homologacao**: o layout esta marcado "a conferir" no codigo. Antes
  de emitir nota de verdade, rodar `npm run conferir-nfse` com certificado A1
  em homologacao.
- **Acessibilidade**: nunca foi auditada com leitor de tela.
- **Desempenho sob carga**: nunca foi medido com mais de um escritorio ativo.
- **Retencao de registros de acesso**: o que e guardado esta declarado, mas nao
  ha rotina de expurgo dos registros antigos de acesso de suporte.

---

## O que ja esta pronto, e foi conferido

Para nao parecer que falta tudo:

- **isolamento entre escritorios** em duas camadas independentes (extensao do
  Prisma e RLS com FORCE em 20 tabelas), com bateria propria de testes que
  roda antes de todo deploy;
- **326 testes** passando, incluindo os de seguranca, de migracao e de preco;
- **dominio, certificado e subdominio por escritorio** funcionando, com prova
  de ponta a ponta feita em producao (cadastro na plataforma, login no
  subdominio, sessao que nao atravessa para outro endereco);
- **tres papeis de banco** (migracao, aplicacao e plataforma), com a aplicacao
  sem BYPASSRLS e sem ser dona das tabelas;
- **segredos cifrados** por escritorio (AES-256-GCM), CSP com nonce, limitador
  de tentativas de login por conta e por origem, e sessao revogavel;
- **conferencia de producao no start** (`npm run conferir-producao`), que
  recusa subir se o isolamento nao estiver de pe;
- **deploy automatico** com CI que constroi do jeito que o Railway constroi;
- **robots, sitemap e pagina 404** (este commit).

---

## Ordem que eu seguiria

1. ~~Recuperacao de senha~~ feita; falta so a credencial do remetente;
2. Rele do DJEN na Vercel (destrava o modulo que mais vende);
3. Chave de IA e contato comercial (duas variaveis, cinco minutos);
4. ~~Backup diario com restauracao testada~~ feito; falta so o destino externo;
5. Monitor externo do healthcheck;
6. Revisao juridica das minutas, em paralelo com tudo acima.

Com 1 a 5 feitos, eu poria um escritorio amigo para usar de verdade — de
preferencia o seu, onde o erro e barato e o retorno chega no mesmo dia.
