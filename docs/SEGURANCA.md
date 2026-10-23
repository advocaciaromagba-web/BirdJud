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

**Guarda: 12 meses** (decisao de 11/10/2026). A rotina semanal
`LIMPAR_VENCIDOS` apaga o registro mais velho que isso
(`expurgarAcessosDeSuporte` em `src/lib/plataforma.ts`). Fica acima dos 6 meses
minimos do Marco Civil (art. 15) para registro de acesso.

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

## O que a revisao de 19/09 procurou, e o que ela achou

Quatro achados, todos corrigidos, e cada um com um teste que **falha sem a
correcao** — foi assim que foram conferidos.

**Falha de segundo fator nao contava tentativa.** Quem ja tivesse a senha
(vazamento de outro site, reuso, anotacao) podia testar o codigo de seis
digitos a vontade: o bloqueio por tentativas so contava senha errada. O segundo
fator virava enfeite. Agora conta igual, e cinco erros bloqueiam a conta.

**O login do operador da plataforma nao tinha teto nenhum.** E a conta que
enxerga todos os escritorios, e nao tem a coluna de bloqueio que o usuario de
escritorio tem. Eram tentativas infinitas contra a senha mais importante do
sistema. Agora ha teto por conta e por origem.

**O login nao tinha limite por origem.** O bloqueio por conta protege uma
senha; nao protege contra quem testa a mesma senha em cem contas diferentes,
que e o ataque que vive de vazamento de outro site. Sao dois ataques, e agora
sao duas defesas.

**A rota de IA nao tinha teto de chamadas.** Cada chamada gasta dinheiro de
verdade na chave da plataforma. Um laco na tela, ou uma conta invadida, viraria
conta alta antes de alguem perceber. Agora ha teto por escritorio e por pessoa,
folgado para uso humano.

### O que foi conferido e estava certo

- **Cabecalho de escritorio forjado nao atravessa**: o middleware apaga o que
  vem de fora antes de escrever o seu. Conferido com a aplicacao rodando,
  mandando o cabecalho de outro escritorio junto com sessao valida.
- Nenhuma rota aceita `escritorioId` vindo do corpo da requisicao.
- Todas as rotas tem guarda; as tres sem sessao sao o cadastro publico (com
  limite de taxa e sem criar escritorio de dentro de outro), o webhook de
  pagamento (token comparado em tempo constante, e recusa se nao estiver
  configurado) e o proprio NextAuth.
- Rota de admin recusa quem nao e admin (conferido com um usuario comum).
- A lista de usuarios nao devolve hash de senha nem segredo de 2FA.
- Mensagem de erro para o cliente e ou do nosso dominio, ou generica: o
  detalhe interno vai para o log, nao para a tela.
- Download de arquivo sai sempre como anexo, com `nosniff`.
- Acesso de suporte fica registrado e nao existe "entrar como o escritorio";
  o painel do operador nao mostra dado de cliente nem de processo.

### Risco conhecido, nao eliminado

O texto da publicacao que vai para a IA vem de fora (DJEN). Um texto
malicioso pode tentar instruir o modelo. O que existe contra isso: as regras da
casa proibem inventar fundamentacao, o resultado e sempre apresentado como
rascunho, e nada do que a IA responde vira acao automatica no sistema. Isso
reduz o estrago, nao elimina a tentativa — e o motivo de a leitura da IA nunca
substituir a conferencia nos autos.

## Registro de revisoes de seguranca

### Revisao de 25/09/2026

- O acesso do operador agora consulta se a conta continua ativa em cada rota
  protegida; desativar a conta invalida tambem os JWTs ja emitidos.
- O upload confere se o cliente e o processo vinculados pertencem ao mesmo
  escritorio. A API limita os bytes do multipart antes de chamar `formData()`.
- A emissao de cobranca reserva uma operacao identificada por UUID antes do
  POST no Asaas e envia o id interno em `externalReference`. Uma resposta
  incerta deixa a linha `PENDENTE`: o botao de conciliacao consulta o Asaas e
  nao dispara outro POST. Resultado vazio ou multiplo exige conferencia na
  conta Asaas. A migracao `17_cobranca_idempotente` acrescenta a chave unica.
- Uma falha temporaria apos enviar uma DPS deixa a nota `INDETERMINADA`, nunca
  `RECUSADA` sem resposta definitiva. Consulte a DPS no ambiente nacional
  antes de emitir outra. O transporte da NFS-e ainda depende de homologacao.

Estas mudancas nao substituem a prova com banco, Asaas sandbox e NFS-e em
homologacao antes de uso real.

| Data | O que foi feito | Resultado |
| --- | --- | --- |
| 2026-09-18 | Revisao antes do piloto: guarda de todas as rotas e paginas, uso do papel que atravessa o RLS, campos sensiveis em respostas, travessia de caminho nas paginas juridicas, cabecalhos e limite de taxa | 3 achados, todos corrigidos: purga nao apagava os trabalhos da fila (e o comentario dizia que apagava faturas, que ficam de proposito); faltavam cabecalhos de seguranca; cadastro publico sem limite de taxa |
| 2026-09-18 | Dividas fechadas: revogacao de sessao, CSP com nonce, limite de taxa no banco e webhook de pagamento. Verificacao em navegador de verdade sob a CSP nova | 1 achado: `upgrade-insecure-requests` quebrava a aplicacao servida por HTTP; passou a depender do protocolo da requisicao |
| — | teste de restauracao de backup | roda na bateria automatica (`testes/fase5.test.ts`), restaurando ao lado do original e conferindo registro a registro |
| 2026-09-19 | Revisao adversarial do sistema inteiro, depois dos sete modulos: forca bruta no login, segundo fator, conta do operador, isolamento por cabecalho forjado, papeis, vazamento em mensagem de erro, limites de custo, acesso de suporte | 4 achados, todos corrigidos e com teste que falha sem a correcao (`testes/seguranca.test.ts`): falha de segundo fator nao contava tentativa; login do operador sem teto nenhum; login sem limite por origem; rota de IA sem teto de chamadas |

## "Esqueci a senha" do console (17/10/2026)

O login do console (`/plataforma/login`) tem **Esqueci a senha**. Mesmas regras
do escritorio (`redefinicao.ts`), mais apertadas, em
`src/lib/redefinicao-do-operador.ts`:

- link de **uso unico, valido por 30 minutos**, mandado ao e-mail do operador
  (`/plataforma/redefinir-senha?t=...`); o banco guarda so o hash
  (`RedefinicaoDoOperador`, sob RLS sem politica: a aplicacao nao ve);
- pedir de novo derruba o link anterior;
- a resposta e a mesma exista ou nao o operador (nao entrega quem tem acesso);
- teto de 5 pedidos por hora por origem e 3 por conta; 10 trocas por origem;
- senha nova de **12 caracteres** no minimo;
- trocar grava `sessoesValidasApos`: toda sessao de operador aberta antes cai
  (`exigirOperador`), e o limite de tentativas de entrada da conta e zerado;
- so no endereco da plataforma: de dentro de um escritorio a rota recusa.

## Vazamento das variaveis de ambiente do Railway (21 e 22/10/2026)

O Railway comunicou que um terceiro pode ter lido as variaveis de ambiente
dos clientes, e decifrado parte delas. Tudo que estava em variavel la tem de
ser tratado como vazado. O que NAO vazou por esse caminho: o banco (nao tem
proxy publico; a URL interna nao abre de fora), as credenciais dos
escritorios (cifradas no banco; so abrem com o banco E a chave) e as senhas
das pessoas (hash).

### O que trocar, em ordem de dano

| Variavel | O que o vazamento permite | Onde se troca |
|---|---|---|
| `BACKUP_S3_CHAVE`, `BACKUP_S3_SEGREDO` | baixar os backups cifrados do R2 | Cloudflare > R2 > tokens: revogar e criar; e `BACKUP_CHAVE` nova (`openssl rand -base64 32`), a antiga guardada fora para restaurar backups antigos |
| `ASAAS_PLATAFORMA_CHAVE` | mexer na conta de cobranca da plataforma, ler dados de pagamento | Asaas > Integracoes > chave de API |
| `ASAAS_WEBHOOK_TOKEN` | forjar "fatura paga" | Asaas > webhook, token novo |
| `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFICACAO` | mandar mensagem pelo numero da plataforma, forjar retorno | Meta for Developers > app > token de sistema e segredo do app |
| `RESEND_API_KEY` | mandar e-mail como `envio.birdjud.com.br` | Resend > API keys: criar nova, apagar a antiga |
| `PLATAFORMA_SMTP_SENHA` | mandar e-mail pela conta Gmail do rele | Google > senhas de app: revogar e criar |
| `EMAIL_RELE_TOKEN`, `DJEN_RELE_TOKEN` | usar os reles na Vercel | variaveis dos reles na Vercel e aqui, token novo |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | gastar a conta de IA (o alvo declarado do ataque) | painel de cada provedor: revogar e criar |
| `MICROSOFT_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET` | autorizar como o aplicativo da nuvem | Azure > app registration; Google Cloud > credenciais |
| `NFSE_PLATAFORMA_PFX`, `NFSE_PLATAFORMA_SENHA` | emitir nota como a Blackbird | se ja estavam la: revogar o certificado na AC e emitir outro |
| `SEGREDO_CHAVE` | abrir as credenciais dos escritorios SE o banco tambem for lido | chave nova + `npm run trocar-segredo-chave` (abaixo) |
| `NEXTAUTH_SECRET` | forjar sessao | valor novo; toda sessao aberta cai |
| `DATABASE_URL*` (senhas de `birdjud_app`, `birdjud_owner`, `birdjud_plataforma`) | so de dentro da rede do Railway | `ALTER ROLE ... PASSWORD` por um servico temporario (docs/RAILWAY.md) e URLs novas |
| `ARQUIVOS_SEGREDO`, `VIGIA_*`, `OPERADOR_SENHA` | so de dentro / senha inicial do operador | valor novo; trocar a senha do operador no console |

A troca so e completa quando a credencial ANTIGA esta revogada na origem:
variavel nova com a antiga ainda valendo nao fecha nada.

### Trocar a SEGREDO_CHAVE

```sh
SEGREDO_CHAVE_ANTIGA=<antiga> SEGREDO_CHAVE=<nova> npm run trocar-segredo-chave
```

Recifra `Integracao.dados` de todos os escritorios (SMTP, Asaas, Autentique,
WhatsApp, Microsoft, Google, certificado da NFS-e). Idempotente; o que nao
abre com nenhuma das chaves e listado para o escritorio reconectar. Os links
assinados das notas da plataforma ja enviados deixam de abrir: reenviar pelo
console. Depois, apagar `SEGREDO_CHAVE_ANTIGA` do ambiente.

### Depois de trocar

- Conferir os registros de cada servico (Asaas, Meta, Resend, provedores de
  IA, Cloudflare R2) por uso estranho no periodo.
- Rodar `npm run conferir-producao` (roda no start) e o vigia externo.
- Anotar a data da troca nesta pagina.

## Entrar no escritório como suporte (23/10/2026)

Na ficha do escritório, no console: o operador escreve o motivo e clica em
"Entrar como suporte". O registro de acesso de suporte (Termos de Uso, item
5) nasce antes da entrada, com operador, escritório, motivo e horário. O
console recebe um link assinado (HMAC com segredo derivado da
`NEXTAUTH_SECRET`) que vale 2 minutos e uma vez só, e só no subdomínio
daquele escritório. A sessão aberta vale 1 hora, como o administrador mais
antigo, com uma faixa amarela em toda tela e o botão "Encerrar acesso de
suporte". Cada tela confere no banco se o acesso continua aberto: encerrar
pela faixa ou pela ficha derruba a sessão na tela seguinte.

O que a sessão de suporte não faz: aceitar os documentos em nome do
escritório, trocar a senha ou o segundo fator da pessoa, e destravar a área
de administração (o financeiro do escritório pede a senha de administração
dele). Código em `src/lib/acesso-de-suporte.ts`; testes em
`testes/acesso-de-suporte.test.ts`.

## Purga completa e exclusão definitiva (23/10/2026)

A purga por prazo de retenção apagava uma lista feita à mão de 15 tabelas e
deixava outras 23 com dado do escritório. Agora ela descobre no banco toda
tabela com `escritorioId` e apaga todas, menos faturas, assinatura, aceites,
notas da plataforma e o registro de suporte (`TABELAS_QUE_FICAM` em
`src/lib/encerramento.ts`).

A exclusão definitiva pelo console exige digitar o endereço do escritório e
o motivo. Sem fatura paga nem nota, some tudo; com histórico fiscal, fica só
o registro fiscal e a casca marcada como purgada.
