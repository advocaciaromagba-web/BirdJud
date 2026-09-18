# Arquitetura do BirdJud

## Regra de independencia

O BirdJud e um produto autonomo. Nao compartilha banco, repositorio, credencial,
conta de integracao, fila ou webhook com nenhum outro sistema. O unico
reaproveitamento permitido e de **arquitetura**: modelagem, padroes de codigo e
desenho das rotinas, reescritos aqui.

Consequencias praticas:

- nenhum `.env`, certificado, token ou modelo de mensagem vem de fora;
- banco proprio e vazio, em projeto de infraestrutura separado;
- nenhuma rotina deste produto e acionada por outro sistema, nem o contrario;
- um escritorio que ja use outro sistema entra como cliente novo, pela
  importacao de planilha — nenhum banco e conectado, copiado ou espelhado.

## Isolamento — duas travas independentes

**Trava 1, no codigo** (`src/lib/prisma.ts`): a extensao do Prisma injeta
`escritorioId` em toda leitura e escrita, a partir do contexto
(`src/lib/contexto.ts`). Consulta sem escritorio no contexto lanca erro.

**Trava 2, no banco** (`prisma/rls.sql`): Row Level Security no PostgreSQL. Cada
consulta roda dentro de uma transacao que define `app.escritorio_id`; a politica
so devolve linhas daquele escritorio.

Detalhes que derrubam o RLS se esquecidos:

- o usuario da aplicacao **nao pode** ser dono das tabelas nem superusuario —
  por isso tambem usamos `FORCE ROW LEVEL SECURITY`;
- `set_config` precisa estar na **mesma transacao** da consulta, por causa do
  pool de conexoes — e o que `comEscritorio()` garante;
- migracoes rodam com outro usuario (`DATABASE_URL_MIGRACAO`).

## Os tres papeis de banco

| Papel | Para que serve | RLS |
| --- | --- | --- |
| `birdjud_owner` | migracoes e `prisma/rls.sql` | sujeito (`FORCE`) |
| `birdjud_app` | a aplicacao (`prisma`, `prismaSemEscritorio`) | sujeito |
| `birdjud_plataforma` | `prismaPlataforma()`: cadastro de escritorio, painel do operador, rotinas | **atravessa** (`BYPASSRLS`) |

O plano de controle precisa de um papel que atravesse o RLS porque cadastrar um
escritorio acontece quando ainda nao ha escritorio no contexto. Ele e o unico
caminho privilegiado do sistema: nunca deve ser chamado a partir de uma rota de
escritorio, e todo acesso de suporte a dados de um escritorio passa por
`AcessoSuporte`.

## A view EscritorioPublico

A tela de login precisa resolver `<slug>.birdjud.com.br` antes de haver sessao.
A view expoe **so** colunas de marca e nenhuma de negocio.

Detalhe que custou um teste vermelho: a view precisa **pertencer a
`birdjud_plataforma`**. Uma view roda com os privilegios do dono
(`security_invoker = false`, o padrao) e `birdjud_owner` tambem esta sob
`FORCE ROW LEVEL SECURITY` — se a view fosse dele, devolveria zero linhas e a
tela de login ficaria sem marca. Como ela atravessa o RLS, nao acrescentar
nenhuma coluna de negocio a ela.

## Modulos

`src/lib/modulos.ts` e o ponto unico. Menu, rotas e rotinas consultam so
`moduloAtivo()` / `exigirModulo()`. Modulo nao contratado some do menu, faz a
rota responder 403 e a rotina nem roda para aquele escritorio.

## Credenciais

Nunca em variavel de ambiente. Cada escritorio cadastra as suas; elas sao
cifradas em AES-256-GCM (`src/lib/segredo.ts`) e guardadas em `Integracao`.
`obterIntegracao(escritorioId, tipo)` e o unico caminho de leitura.

## Bateria de isolamento

`testes/isolamento.test.ts` cria dois escritorios e tenta ler, alterar e apagar
dados do outro — 10 casos, incluindo dois que driblam a trava 1 de proposito
para provar que o RLS sozinho ja barra. Roda no CI a cada push e antes de todo
deploy. Nenhuma rota entra no sistema sem estar coberta por ela.

## Autenticacao e sessao (fase 1)

O endereco decide o escritorio, sempre no servidor:

1. `src/middleware.ts` (runtime edge, sem Prisma) le o `Host`, extrai o slug e
   o poe no cabecalho `x-escritorio-slug`. O cabecalho e **apagado antes** de
   ser reescrito: nada vindo de fora e aproveitado.
2. `src/lib/sessao.ts` traduz o slug em escritorio pela view `EscritorioPublico`.
3. `authorize()` em `src/lib/auth.ts` faz a mesma resolucao pelo `Host` da
   requisicao. Nada do corpo do POST participa: se o escritorio viesse de la,
   bastaria forjar o id de outro escritorio ou um status diferente do real.

`exigirSessao()` recusa quando:

- o endereco nao corresponde a escritorio nenhum;
- o escritorio esta `SUSPENSO` ou `ENCERRADO` (`INADIMPLENTE` ainda entra —
  cobranca nao e bloqueio imediato);
- nao ha sessao;
- **a sessao e de outro escritorio** — cookie de A no subdominio de B nao vale.

Essa ultima e a que sustenta o modelo. Ha duas camadas: o cookie do NextAuth e
host-only, entao o navegador nem envia para outro subdominio; e, se for enviado
a mao, a guarda recusa.

Senha e bcrypt com custo 12; cinco erros bloqueiam o usuario por 15 minutos; o
segundo fator e TOTP e o QR Code sai com o nome do **escritorio**, nao da
plataforma. A tela de login devolve sempre a mesma mensagem, para nao revelar
se o e-mail existe, se a senha esta errada ou se a conta esta bloqueada.

## Duas camadas de permissao

| Camada | Pergunta | Onde |
| --- | --- | --- |
| Modulo contratado | o **escritorio** paga por esta area? | `src/lib/modulos.ts` |
| Papel do usuario | esta **pessoa** pode fazer isto? | `src/lib/papeis.ts` |

As duas precisam permitir. `exigirSessao(modulo?)` cobre a primeira;
`exigirAdmin(modulo?)` cobre as duas. O menu segue a mesma regra: area que a
pessoa nao pode abrir nao aparece.

## Conta do usuario

- **Troca de senha**: exige a senha atual. A sessao e JWT com validade de 12h,
  entao uma sessao ja aberta continua valendo ate expirar — trocar a senha
  impede logins novos, nao derruba os antigos. Revogacao imediata depende de
  guardar sessao no banco; fica para quando houver necessidade real.
- **Segundo fator**: `/api/conta/dois-fatores/preparar` gera o segredo e o QR
  Code, mas **nao grava nada**. O segredo so vai para o banco quando o usuario
  confirma com um codigo valido — assim ninguem fica travado com um segundo
  fator que nao conseguiu cadastrar. Desligar exige senha **e** codigo.
- O QR Code sai com o nome do escritorio como emissor, nunca "BirdJud".

## Referencias entre registros

Toda rota que recebe o id de outro registro (`clienteId` em um processo,
`processoId` em um compromisso) confere antes de usar que ele existe **neste**
escritorio. A extensao do Prisma ja filtra a leitura, entao um id de outro
escritorio simplesmente nao aparece e a rota responde 400 — e nao cria um
vinculo entre escritorios diferentes.

## Modulo, faixa e consumo (fase 2)

**Modulo** e o que o escritorio paga. `exigirSessao("FINANCEIRO")` na rota e o
filtro do menu usam a mesma funcao (`moduloAtivo`), entao area nao contratada
some da navegacao **e** responde 403 — nunca so uma das duas. Quem contrata e a
plataforma (`scripts/contratar-modulo.mjs`, e o painel do operador na fase 4):
um escritorio nao pode se conceder um modulo pago.

**Faixa** limita pessoas, nao recursos. Usuario inativo nao ocupa lugar, e o
limite de advogados e separado do de apoio. `exigirVagaNaFaixa()` roda antes de
criar o usuario e responde 409 com o nome da faixa e o limite.

A faixa e lida da tabela `Escritorio` dentro de `comEscritorio()`, e **nao** pela
view `EscritorioPublico`: aquela view atravessa o RLS para a tela de login achar
a marca, e plano e dado de negocio — na view, exporia o plano de todo mundo.

**Consumo** tem duas formas de medir: `registrarConsumo()` soma (evento a
evento, como uma mensagem enviada) e `definirConsumo()` substitui (retrato do
mes, como a contagem de registros). A franquia vem de `ModuloContratado.
franquia`; o que passa dela e excedente. Metrica de nucleo nao tem modulo, logo
nunca tem excedente.

## Fila de trabalho

Tabela `Trabalho` no proprio PostgreSQL, reclamada com `FOR UPDATE SKIP LOCKED`.

Nao usamos pg-boss porque ele cria o proprio schema em tempo de execucao, e o
papel da aplicacao nao tem DDL de proposito — e o que sustenta o RLS. Uma tabela
nossa resolve sem dependencia nova e sem abrir privilegio.

A regra que importa: **um trabalho em execucao por escritorio**, garantida por um
`NOT EXISTS` dentro da propria reclamacao. Um escritorio com integracao quebrada
segura a propria fila e nao atrasa a dos outros. Como isso tambem significa que
um trabalho preso travaria aquele escritorio para sempre, `destravar()` devolve a
fila o que ficou em EXECUTANDO por tempo demais (processo morto, deploy, queda).

Falha volta para PENDENTE com espera crescente enquanto houver tentativa; depois
para em FALHOU. `espalhar()` transforma "rotina do sistema" em "uma rotina por
escritorio", pulando quem esta suspenso/encerrado e quem nao contratou o modulo
daquele trabalho.

O trabalhador (`npm run trabalhador`) conecta com o papel do plano de controle,
mas todo executor roda dentro de `comEscritorio()`: mesmo la, o codigo de negocio
ve so o escritorio da vez.

## Integracoes conectadas pelo escritorio (fase 3)

Cada integracao e um **conector** (`src/lib/conectores/`) que declara os campos
que pede, como resumir o que foi guardado sem vazar segredo, e como testar a
conexao de verdade. A tela e as rotas so conhecem o registro — nao ha `if` por
provedor espalhado pelo codigo.

O caminho de uma conexao:

1. o administrador do escritorio preenche o formulario do conector;
2. a rota confere o modulo contratado e os campos obrigatorios;
3. **testa antes de guardar** e grava credencial e veredito juntos;
4. a credencial e cifrada em AES-256-GCM e nunca volta para a tela — nem para
   quem a cadastrou. A tela mostra status, ultimo erro e quando foi verificada.

A credencial fica guardada mesmo quando o teste falha, de proposito: o
escritorio corrige o que faltou e testa de novo sem redigitar tudo. Quem vai
*usar* a integracao, porem, nao pega credencial marcada com ERRO —
`obterIntegracao()` a trata como ausente, a menos que se peca `mesmoComErro`
(o que so a tela de integracoes faz, para poder testar de novo).

### O que cada conector testa

| Conector | Teste real |
| --- | --- |
| E-mail (SMTP) | abre a conexao e autentica (`verify()`) |
| Asaas | `GET /myAccount` com `access_token` |
| Autentique | `{ me { id email } }` por GraphQL com Bearer |
| WhatsApp (Meta) | consulta o numero e le nome e nota de qualidade |
| Certificado e-CNPJ | abre o PKCS#12 com a senha, le o titular e a validade |

GraphQL responde 200 mesmo recusando o token, entao o conector do Autentique
olha o corpo, nao so o codigo. Todas as chamadas tem tempo limite: integracao de
terceiro que trava nao pode segurar a requisicao do escritorio nem um trabalho
da fila.

### Conectores que ainda nao testam sozinhos

OneDrive e Google Drive dependem de OAuth com o aplicativo registrado em cada
provedor. Estao no registro, mas nao oferecem formulario de credencial: sem o
OAuth a conexao nao chegaria a existir, e um formulario ali seria teatro.

**Publicacoes sao so pelo DJEN.** A AASP foi descartada como fonte, entao nao ha
modulo `PUBLICACOES_AASP` nem conector para ela — em vez de um modulo que existe
no menu e nunca funciona.

## Venda e operacao (fase 4)

### Ciclo comercial

Cadastro (`/cadastro`, so no endereco da plataforma) cria escritorio em `TESTE`
com assinatura e periodo de teste correndo. Dai em diante quem conduz e a fila:
`REGUA_DE_COBRANCA` roda por escritorio e faz duas coisas — gera a fatura do mes
quando o teste acabou, e ajusta o status pelo atraso da fatura em aberto mais
antiga.

```
TESTE --(teste acabou)--> ATIVO --(5 dias)--> INADIMPLENTE --(15 dias)--> SUSPENSO
  ^                                                                          |
  +---------------------------- pagamento ----------------------------------+
```

`SUSPENSO` bloqueia o login (`STATUS_QUE_ENTRAM`), `INADIMPLENTE` nao — cobranca
nao e bloqueio imediato. `ENCERRADO` e decisao humana: a regua nao mexe nele, nem
para reativar. O espalhamento da regua alcanca tambem os suspensos, porque e o
pagamento deles que os devolve ao ar.

Duas regras que so apareceram ao rodar o ciclo de ponta a ponta:

- **Fatura nunca nasce vencida.** Um escritorio cujo teste acaba depois do dia de
  vencimento receberia a primeira fatura ja em atraso e seria marcado inadimplente
  no mesmo instante. `vencimentoComPrazo()` garante `PRAZO_MINIMO_DIAS` entre a
  emissao e o vencimento.
- **Fim do teste vira cliente pagante**, mesmo com a primeira fatura ainda a
  vencer. Sem isso o escritorio ficaria em `TESTE` para sempre, porque sem atraso
  a regua nao tinha motivo para mexer no status.

### Precos

`src/lib/precos.ts` tem a tabela, e ela e **provisoria** — o plano de projeto e
explicito em que so pode ser fechada depois de levantar custos reais e conferir
concorrentes. Trocar a tabela nao mexe em contrato assinado: o valor combinado
com cada escritorio fica gravado em `Assinatura.valorCentavos`.

A fatura guarda a memoria de calculo em `detalhe` (faixa, modulos, excedentes),
para a conversa com o cliente nao depender de recalcular meses depois.

### Pagamento

Hoje a baixa e manual, pelo operador. Quando a cobranca automatica entrar, o
webhook do meio de pagamento chamara a mesma `registrarPagamento()` — o caminho
de baixa e um so, e e ele que reavalia o status do escritorio.

### Operador da plataforma

Login separado (`/plataforma/login`), provedor proprio, e a sessao carrega
`escritorioId` vazio. Isso e o que fecha os dois sentidos: a guarda do escritorio
compara o escritorio da sessao com o do endereco (vazio nunca casa), e a guarda
do operador exige endereco de plataforma e papel `OPERADOR`.

**Todo acesso do operador a um escritorio vira linha em `AcessoSuporte`** —
abrir a ficha no painel, mudar faixa, contratar modulo, dar baixa em fatura. E o
acesso que atravessa o isolamento, entao e o que mais precisa de rastro.

Nao existe "entrar como o escritorio" (impersonacao): o painel e leitura mais
acoes administrativas. Se um dia for necessario, ja ha onde registrar.

### Exportacao

`/api/exportacao` devolve tudo do escritorio em JSON — saida de cliente e pedido
de titular pela LGPD. **Nao** inclui `senhaHash`, segredo de 2FA nem a credencial
cifrada das integracoes: segredo de autenticacao e de terceiro nao e dado do
escritorio, e um arquivo desses circula por e-mail.

## Modulo de publicacoes (DJEN)

Publicacoes vem **so do DJEN**, a API Comunica do CNJ. O escritorio cadastra as
OABs que quer monitorar; a fila roda uma captura por escritorio.

### Duas coisas descobertas ao construir

**A API bloqueia por pais.** De fora do Brasil a resposta e 403 (CloudFront).
Isso confirma na pratica o "rele no Brasil" que o plano previa: o trabalhador da
fila precisa rodar em infraestrutura brasileira, e o cliente traduz o 403 nessa
mensagem em vez de um erro generico.

**O mapeamento de campos nao pode ser conferido daqui.** Ele foi escrito a
partir da documentacao e esta todo em `src/lib/djen.ts` — o resto do modulo so
conhece o tipo `Comunicacao`. `npm run conferir-djen -- <oab> <uf>`, rodado do
Brasil, busca uma pagina real e mostra o que caiu em cada campo, marcando o que
veio vazio. **Enquanto isso nao for feito, trate o mapeamento como suspeito.**

### Deduplicacao e vinculo

A chave `(escritorioId, idExterno)` e o que impede a mesma comunicacao de entrar
duas vezes — e ela chega duas vezes mesmo, quando duas OABs do escritorio
aparecem no mesmo ato. Por isso a captura tambem pode sobrepor periodo sem medo:
repetir e barato, perder publicacao de borda nao e.

A publicacao e vinculada ao processo quando o numero ja existe no escritorio.
Para isso o numero tem **uma grafia canonica**: so digitos, quando e CNJ
(`numeroParaGravar`). Antes disso, processo cadastrado com mascara nunca casava
com o numero vindo do diario, e o vinculo automatico — que e o valor do modulo —
simplesmente nao acontecia. Numero que nao e CNJ fica como foi digitado.

### Triagem

`leitura-publicacao.ts` le prazo e urgencia do texto, com funcoes puras. Havendo
mais de um prazo, fica com o menor: e o que vence primeiro. Urgencia vem de ato
que nao espera (audiencia, liminar, penhora...) ou de prazo curto.

Isto e **triagem, nao conclusao juridica**: o prazo aparece na tela como
sugestao, para o advogado conferir. O sistema nunca decide sozinho que algo nao
precisa de atencao.

### Falha de uma OAB

Falha em uma OAB nao interrompe as outras, e aparece nomeada no erro do
trabalho. A OAB que falhou **nao tem a marca de ultima captura avancada** — se
avancasse, a proxima consulta comecaria depois de um periodo que ninguem chegou
a ler, e essas publicacoes se perderiam em silencio.

## Migracao que mexe em dados

As migracoes rodam como `birdjud_owner`, que tambem esta sob `FORCE ROW LEVEL
SECURITY`. Sem `app.escritorio_id` definido, a politica nao devolve linha
nenhuma: **um `UPDATE` de dados afeta zero registros, sem erro nenhum**. Foi
exatamente o que aconteceu na primeira versao da migracao `7_numero_canonico`.

Migracao que mexe em dados precisa suspender o FORCE e repor no fim:

```sql
ALTER TABLE "Tabela" NO FORCE ROW LEVEL SECURITY;
UPDATE "Tabela" SET ...;
ALTER TABLE "Tabela" FORCE ROW LEVEL SECURITY;
```

O Prisma roda cada migracao em uma transacao, entao uma falha no meio desfaz
tambem a suspensao. Migracao que so mexe em estrutura nao precisa disso.

## Modulo de e-mail: avisos

O que faz a publicacao capturada de madrugada chegar ao advogado no mesmo dia.
Dois avisos hoje: **resumo das publicacoes nao lidas** e **lembrete de
compromisso** com 24h de antecedencia.

### Gerar e enviar sao etapas separadas

`gerarAvisos()` decide quem recebe o que e grava cada aviso como PENDENTE.
`enviarAvisosPendentes()` pega os pendentes e entrega. Separadas:

- a rotina pode rodar de novo sem duplicar — quem garante e a chave de
  idempotencia `(escritorioId, chave)`, com `resumo:<dia>:<usuario>` e
  `lembrete:<compromisso>:<usuario>`;
- uma falha de SMTP nao faz o sistema **esquecer** que devia avisar. O aviso
  continua la, e sai na proxima rodada.

### Tres decisoes que mudam o comportamento

**Sem publicacao nao lida, nao ha resumo.** Um e-mail vazio todo dia treina a
equipe a ignorar o remetente — justamente o que nao se pode perder no dia em
que houver uma intimacao urgente.

**A urgencia vai no assunto** (`[URGENTE] 3 publicacoes novas`). E o assunto que
decide se a pessoa abre agora ou depois do almoco.

**E-mail nao conectado nao e falha.** Quando o escritorio ainda nao conectou o
SMTP, o envio devolve `semRemetente` e os avisos ficam pendentes, **sem gastar
tentativa**. Marcar como falha ali perderia o aviso de quem so configurou o
e-mail depois.

Falha de verdade (servidor recusou, caixa inexistente) conta tentativa e para em
FALHOU no limite — mas a linha fica, para o escritorio poder ver que aquele
aviso nunca chegou.

### O remetente e do escritorio

A mensagem sai do dominio que o escritorio conectou em Integracoes; o cliente
recebe do advogado, nao da plataforma. A plataforma **nao tem remetente proprio
para emprestar** — e escolha, nao limitacao: e-mail de escritorio de advocacia
saindo de um dominio de terceiro e o caminho mais curto para a caixa de spam e
para a desconfianca do cliente.

O envio abre **uma** conexao SMTP por lote, nao uma por mensagem: abrir uma por
mensagem e o jeito mais rapido de um provedor tratar o escritorio como abuso.

## Modulo de IA

Duas funcoes sobre a publicacao ja capturada: **leitura** (resumo, prazo
indicado, providencia) e **rascunho de manifestacao** a partir de uma instrucao
do advogado.

### A regra que atravessa tudo: a IA rascunha, nao conclui

As instrucoes estao em `src/lib/prompts-ia.ts`, separadas do codigo de API para
poderem ser lidas e revistas por quem entende de direito. Elas proibem
explicitamente:

- inventar numero de lei, artigo, sumula ou precedente — faltando certeza, o
  argumento vai sem citacao, ou com aviso de que a fundamentacao precisa ser
  conferida;
- inventar fato, valor, data ou nome que nao esteja no material — o que falta
  vira `[CONFERIR: ...]` no texto;
- afirmar prazo — prazo e sempre indicacao, com "(conferir nos autos)".

Na tela, a leitura aparece sob o rotulo "rascunho, confira nos autos". Num
sistema de advocacia, saida de modelo apresentada como peca pronta e risco para
o cliente e para a inscricao do advogado.

### Fallback de recusa ligado

`fallbacks: "default"` na chamada. Texto de processo criminal, de familia ou de
violencia domestica toca assunto que o classificador de seguranca pode recusar;
sem o fallback, o advogado veria o sistema simplesmente falhar num caso
legitimo. Com ele, a API refaz a chamada em outro modelo.

Por isso `AnaliseIA.modelo` guarda **o modelo que respondeu**, nao o que foi
pedido: com fallback os dois podem diferir, e uma peca precisa poder ser
auditada. Recusa que chega ao fim da cadeia vira erro proprio (422), nao texto
vazio.

### Medicao e unidade de cobranca

A chave e da plataforma, entao o consumo e medido por escritorio em
`IA_MIL_TOKENS` — **milhares** de tokens, nao tokens.

A unidade importa: preco de excedente e inteiro em centavos, e um centavo por
token daria umas 370 vezes o custo do modelo. Foi o erro que a tabela
provisoria tinha antes deste modulo existir.

Tokens lidos de cache contam na medicao. Custam menos, mas nao sao de graca —
e o sistema fica marcado para cache justamente porque a instrucao nao muda
entre chamadas.

### Travas antes da chamada paga

Entrada acima de `LIMITE_DE_CARACTERES` e recusada **antes** de virar chamada;
o teto de saida por chamada protege contra peca truncada no meio. A cota de
verdade e a franquia do modulo, medida em `ConsumoMensal`.
