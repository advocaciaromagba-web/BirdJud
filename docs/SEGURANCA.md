# Seguranca do BirdJud

Documento tecnico de apoio ao contrato e ao acordo de LGPD. O que esta aqui e o
que o codigo faz hoje — quando algo ainda nao existe, esta escrito que nao
existe.

## Isolamento entre escritorios

Duas travas independentes, detalhadas em `docs/ARQUITETURA.md`:

1. **codigo** — extensao do Prisma injeta `escritorioId` em toda leitura e
   escrita; consulta sem escritorio no contexto lanca erro;
2. **banco** — Row Level Security com `FORCE`, em todas as tabelas de
   escritorio, com o `app.escritorio_id` definido na mesma transacao.

O usuario de banco da aplicacao nao e dono das tabelas nem superusuario. Um
terceiro papel, com `BYPASSRLS`, existe so para o plano de controle.

Uma bateria automatica cria dois escritorios e tenta ler, alterar e apagar dados
de um a partir do outro, inclusive driblando a trava de codigo de proposito.
**Ela roda no CI a cada push e antes de todo deploy.**

## Credenciais e segredos

- senha de usuario: bcrypt com custo 12;
- segundo fator: TOTP, opcional por usuario, com QR Code em nome do escritorio;
- credencial de integracao: AES-256-GCM, guardada cifrada, **nunca devolvida a
  tela** — nem para quem a cadastrou;
- a chave de cifragem (`SEGREDO_CHAVE`) fica so no ambiente. Sem ela, um backup
  vazado nao entrega credencial de integracao nenhuma.

Bloqueio de 15 minutos apos 5 tentativas de senha erradas. A tela de login
devolve sempre a mesma mensagem, para nao revelar se o e-mail existe.

## Sessao

Sessao em JWT, validade de 12 horas, cookie host-only — o navegador nao o envia
para outro subdominio. Alem disso, a guarda de rota recusa sessao de um
escritorio no endereco de outro.

**Revogacao:** cada sessao carrega o momento em que foi emitida, e cada usuario
tem uma marca `sessoesValidasApos`. Trocar a senha empurra a marca para agora, e
toda sessao emitida antes dela cai na requisicao seguinte — inclusive a de quem
trocou, que por isso e deslogado pela propria tela. Usuario desativado tambem
perde as sessoes abertas.

Isso custa uma consulta por requisicao protegida. E o preco de nao depender da
expiracao de 12 horas quando uma senha vaza.

## Acesso de suporte

Todo acesso de operador da plataforma a um escritorio — abrir a ficha, mudar
faixa, contratar modulo, dar baixa em fatura — grava linha em `AcessoSuporte`
com operador, escritorio, motivo e momento.

Nao existe "entrar como o escritorio" (impersonacao). Se um dia existir, o
registro ja tem onde ficar.

## Backup e restauracao

- backup por escritorio em JSON completo (`npm run backup`), incluindo as
  credenciais **cifradas**;
- restauracao para um escritorio novo (`npm run restaurar`), usada tambem para
  testar o procedimento sem tocar no original;
- o teste de restauracao roda na bateria automatica: faz backup de um escritorio
  com dados, restaura em outro e confere registro a registro.

A politica de retencao de copias e a periodicidade ficam no SLA.

**O que ainda falta:** backup automatico agendado em armazenamento externo. Hoje
o comando existe e e testado, mas quem o agenda e a infraestrutura
(`docs/RAILWAY.md`), e o Railway faz backup do banco inteiro, nao por escritorio.

## Exclusao de dados

Encerrar um escritorio marca `encerradoEm`. Depois do prazo de retencao
(`PRAZO_DE_RETENCAO_DIAS`), o trabalho `PURGAR_ENCERRADOS` apaga os dados e
grava `purgadoEm`. O registro de que houve purga fica; os dados, nao.

## Cabecalhos e limites

Todas as respostas levam CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`,
`Referrer-Policy`, `Permissions-Policy` e HSTS (`next.config.js`). O cabecalho
`X-Powered-By` foi desligado.

A CSP usa **nonce por requisicao** com `strict-dynamic`: `script-src` nao aceita
`'unsafe-inline'` nem `'unsafe-eval'` em producao. O nonce e gerado no middleware
e o Next o aplica em todos os scripts que emite. `'unsafe-inline'` continua em
`style-src`, de que o Tailwind precisa — risco bem menor do que em script.

`upgrade-insecure-requests` so e emitido quando a requisicao ja veio por HTTPS
(pelo `x-forwarded-proto`). Emitido em ambiente HTTP, ele faz o navegador buscar
os proprios scripts da pagina em HTTPS e nada carrega — foi o que aconteceu no
primeiro teste em navegador.

O cadastro publico — unica rota publica que escreve no banco — aceita 5
tentativas por IP por hora, contadas **no banco**, em uma unica instrucao SQL:
o limite vale para todas as instancias da aplicacao ao mesmo tempo. Ataque
distribuido continua sendo problema do provedor, antes da aplicacao.

## Suboperadores

| Servico | Para que | Dados |
| --- | --- | --- |
| [PROVEDOR DE INFRAESTRUTURA] | hospedagem e banco | todos |
| [PROVEDOR DE IA] | leitura de documentos, minutas, transcricao | o que o escritorio enviar ao modulo de IA |

Servicos conectados pelo proprio escritorio (WhatsApp, Asaas, Autentique,
e-mail, nuvem) sao contratados por ele, com conta dele.

## Registro de revisoes de seguranca

| Data | O que foi feito | Resultado |
| --- | --- | --- |
| 2026-09-18 | Revisao antes do piloto: guarda de todas as rotas e paginas, uso do papel que atravessa o RLS, campos sensiveis em respostas, travessia de caminho nas paginas juridicas, cabecalhos e limite de taxa | 3 achados, todos corrigidos: purga nao apagava os trabalhos da fila (e o comentario dizia que apagava faturas, que ficam de proposito); faltavam cabecalhos de seguranca; cadastro publico sem limite de taxa |
| 2026-09-18 | Dividas fechadas: revogacao de sessao, CSP com nonce, limite de taxa no banco e webhook de pagamento. Verificacao em navegador de verdade sob a CSP nova | 1 achado: `upgrade-insecure-requests` quebrava a aplicacao servida por HTTP; passou a depender do protocolo da requisicao |
| — | teste de restauracao de backup | roda na bateria automatica (`testes/fase5.test.ts`), restaurando ao lado do original e conferindo registro a registro |
