# WhatsApp (Cloud API da Meta)

**Um numero so, da plataforma, num aplicativo da Meta criado para isto.** Nao
e um numero por escritorio.

## O que este numero e, e o que ele nao e

Ele **notifica**. Audiencia, pericia, prazo, tarefa designada, recibo,
documento gerado — tudo o que o sistema precisa dizer sai por aqui, com o nome
do escritorio na frente.

Ele **nao atende**. Nao e canal de conversa com o cliente. Quem precisa falar
com a banca liga para a banca, e **o telefone dela vai escrito em toda
mensagem**. A unica coisa que o numero le de volta e a confirmacao de presenca
("1" ou "2") — e mesmo nessa resposta ele repete que nao atende.

### O que isso resolve

O escritorio **nao abre conta na Meta**. Era a maior barreira para entrar no
sistema: verificacao de empresa, aplicativo, numero dedicado, modelos
submetidos um a um. Agora a plataforma faz isso uma vez.

### O que isso custa, dito na cara

A **nota de qualidade do numero e uma so**. Um escritorio que dispara demais,
ou que avisa quem nao quer ser avisado, derruba a entrega de todos. E por isso
que o bloqueio por pedido da pessoa (responder "parar") deixa de ser cortesia e
vira defesa do sistema — e por isso toda mensagem diz como parar de receber.

## O fato que manda em tudo

Fora da janela de 24 horas aberta por uma mensagem **do destinatario**, a Meta
so entrega **modelo aprovado por ela**. Aviso do sistema e sempre proativo —
ninguem escreveu pedindo o resumo do dia. Por isso o envio comum e sempre de
modelo. A unica excecao e a resposta automatica a quem acabou de escrever: ali
a janela esta comprovadamente aberta, e so ali sai texto livre.

**Sem os modelos aprovados no aplicativo da plataforma, nao sai aviso nenhum
pelo WhatsApp.** O e-mail continua saindo normalmente.

## Duas coisas em todo modelo

1. **O nome do escritorio no comeco.** Quem recebe nao conhece este numero: ele
   e da plataforma, nao da banca. Sem o nome na primeira linha, a mensagem
   chega como numero desconhecido falando de audiencia.
2. **O telefone do escritorio no fim**, depois da frase que diz que este numero
   nao recebe mensagens. Sem ela, a pessoa responde aqui e acha que falou com o
   advogado.

O telefone fica **antes de um ponto final**, nunca como ultimo caractere: a
Meta recusa modelo que termina em parametro. O teste
`nenhum modelo termina em parametro` em `testes/resposta-whatsapp.test.ts`
guarda isso, junto com a contagem e a ordem dos `{{n}}`.

## Configuracao (da plataforma, uma vez)

| Variavel | O que e |
|---|---|
| `WHATSAPP_NUMERO_ID` | o *Phone number ID* do numero no WhatsApp Manager |
| `WHATSAPP_TOKEN` | token permanente do usuario de sistema do aplicativo |
| `WHATSAPP_VERIFICACAO` | qualquer segredo, para a Meta ligar o webhook |
| `WHATSAPP_APP_SECRET` | o *App Secret*, que assina cada chamada do webhook |

As duas primeiras andam juntas, e as duas ultimas tambem: `conferir-producao`
AVISA quando so uma das duas esta definida. Era erro ate 07/10/2026, e
derrubou o site: a conferencia roda no start, e erro ali impede a aplicacao
de subir. Configuracao pela metade degrada um recurso, nao fura o
isolamento — ver `docs/RAILWAY.md`, 6b.

**Onde cada variavel precisa existir.** Os crons so enfileiram; quem ENVIA
lembrete, resumo e documento e o `trabalhador`. Entao o par de saida
(`WHATSAPP_NUMERO_ID` + `WHATSAPP_TOKEN`) vive na aplicacao E no trabalhador.
O par de entrada (`WHATSAPP_VERIFICACAO` + `WHATSAPP_APP_SECRET`) so na
aplicacao, que e quem a Meta chama. Em 08/10 o trabalhador ficou um dia sem
o par de saida e nenhum lembrete teria saido — sem erro em lugar nenhum.

Em **Integracoes**, o escritorio **nao** ve mais o WhatsApp — e nao precisa
ver. Linhas gravadas de quando era por escritorio ficam no banco, inertes.

## Os modelos para aprovar

No **WhatsApp Manager > Modelos de mensagem > Criar modelo**, categoria
**Utilidade** (nao Marketing: aviso de prazo e utilidade, e a taxa e menor),
idioma **Portugues (BR)**. Quem submete e a plataforma, uma vez.

> **O texto exato de cada modelo vive em `src/lib/modelos-whatsapp.ts`.** Os
> blocos abaixo mostram a forma; antes de submeter, copie do codigo — e ele que
> o sistema manda, e um `{{n}}` fora de ordem entre os dois faz o sistema
> mandar a hora no lugar do nome do cliente.
>
> Todos terminam com: *"Este numero so envia avisos e nao recebe mensagens.
> Para falar com o escritorio, ligue para {{n}}."*

### 1. `birdjud_resumo_publicacoes`

Corpo, exatamente:

```
{{1}}: voce tem {{2}} publicacao(oes) nova(s), sendo {{3}} urgente(s). Abra o sistema para ler o texto completo. O prazo indicado e leitura automatica e serve como alerta — confira sempre nos autos.
```

| Parametro | O que e | Exemplo |
|---|---|---|
| `{{1}}` | nome do escritorio | Advocacia Roma |
| `{{2}}` | quantidade de publicacoes | 7 |
| `{{3}}` | quantas sao urgentes | 2 |

### 2. `birdjud_lembrete_compromisso`

Corpo, exatamente:

```
{{1}}: lembrete de {{2}} em {{3}}. {{4}}. Confira a agenda no sistema.
```

| Parametro | O que e | Exemplo |
|---|---|---|
| `{{1}}` | nome do escritorio | Advocacia Roma |
| `{{2}}` | titulo do compromisso | Audiencia de instrucao |
| `{{3}}` | data e hora | 20/10/2026 14:30 |
| `{{4}}` | local, ou o processo | Forum de Salvador, sala 3 |

### 3. `birdjud_mensagem_nao_entregue` (alerta interno)

Vai **so para a pessoa do escritorio que enviou** a mensagem que nao chegou
(ver `docs/ENTREGA-DE-MENSAGENS.md`). Nunca para o cliente. Categoria
**Utilidade**, idioma **Portugues (BR)**, sem cabecalho nem botao.

Corpo, exatamente:

```
No escritorio {{1}}, a mensagem que voce enviou ({{2}}) para {{3}} nao chegou. Motivo: {{4}}. Abra o sistema em Mensagens para reenviar ou marcar como resolvida. Este numero so envia avisos e nao recebe mensagens. Em caso de duvida, ligue para {{5}}, que e o telefone do escritorio.
```

| Parametro | O que e | Exemplo |
|---|---|---|
| `{{1}}` | nome do escritorio | Advocacia Roma |
| `{{2}}` | o que era, e por onde | Lembrete ao participante, por WhatsApp |
| `{{3}}` | quem deveria receber | Maria da Silva |
| `{{4}}` | o motivo | O numero nao recebe WhatsApp |
| `{{5}}` | telefone do escritorio | (16) 3251-0000 |

Enquanto nao estiver aprovado, o alerta continua saindo por **e-mail**; o
WhatsApp dele falha sem gerar outro alerta.

**A ordem dos parametros e um contrato.** Trocar `{{2}}` por `{{3}}` de um lado
sem trocar do outro faz o sistema mandar a hora no lugar do titulo, e ninguem
percebe ate alguem receber. Os textos acima estao tambem em
`src/lib/modelos-whatsapp.ts`, e ha um teste que confere se cada `{{n}}` do
texto tem significado declarado.

## Conectar — o registro do que existe (08/10/2026)

| O que | Valor |
|---|---|
| Portfolio Meta Business | **Birdjud** (`112124864865169`) — era "Procedente", renomeado |
| App na Meta | **BIRDJUD** (`1121369087026978`), caso de uso "Conectar-se com clientes pelo WhatsApp", **publicado** |
| Conta do WhatsApp Business (WABA) real | **Birdjud** (`2087330425240199`), fuso America/Sao_Paulo, verificada |
| Numero de producao | **+55 16 99799-8152**, nome de exibicao "Birdjud", *Phone number ID* `1405514119307343` |
| Token | permanente, do usuario de sistema `birdjud-sistema` (Admin), permissoes `whatsapp_business_messaging` + `whatsapp_business_management`, nunca expira |
| Webhook | `https://birdjud.com.br/api/webhooks/whatsapp`, campos `messages` e `message_template_status_update` |
| Templates | os 7 de `src/lib/modelos-whatsapp.ts`, criados pela API na WABA real, em analise |

### A licao que custou uma tarde

Ao criar o app, a Meta cria junto uma **"Test WhatsApp Business Account"**
com um numero de teste (+1 555...). Essa conta:

- **nao aceita numero de producao** — a API responde "exclua um numero
  existente ou peca numeros adicionais", que e uma mensagem errada para o
  problema real;
- **nao deixa excluir o numero de teste**;
- **nao e a conta onde o numero real vai parar.**

O numero de producao entra **pela tela** (Business Suite > Contas do
WhatsApp > Adicionar, ou Configuracao da API > Adicionar numero), e isso
cria uma **segunda** WABA — a real. A de teste fica la, inerte. Depois disso
a API funciona normalmente **contra a WABA real**: registrar numero, criar
template, assinar o app (`POST /{WABA}/subscribed_apps`).

Consequencias praticas:

1. **Templates sao por WABA.** Os 7 criados na conta de teste nao valem na
   real; foram recriados la. Quem olhar a conta de teste vai ver 7 templates
   orfaos — ignore.
2. **O webhook e por app, mas a WABA precisa estar assinada no app.** Sem o
   `subscribed_apps`, a Meta valida o endereco e nunca entrega mensagem.
3. **Token de 24h gerado na Configuracao da API vence as 8h do dia seguinte**
   (horario da Meta). Serve para experimentar; producao e sempre o
   permanente do usuario de sistema.
4. Para o usuario de sistema gerar token com permissoes de WhatsApp, ele
   precisa ter o app E a WABA em **Ativos atribuidos**, e a tela de
   permissoes pode demorar alguns minutos para refletir isso.

### Para conferir sem abrir a Meta

```
GET /{WABA}/phone_numbers?fields=display_phone_number,verified_name,code_verification_status
GET /{WABA}/message_templates?fields=name,status
GET /{WABA}/subscribed_apps
GET /{APP_ID}/subscriptions?access_token={APP_ID}|{APP_SECRET}
```

Cada pessoa, em **Minha conta**, informa o telefone e marca "Receber tambem
no WhatsApp". Telefone que o sistema nao consegue ler e recusado ali, com a
pessoa olhando para o campo — melhor que virar aviso perdido.

## Entrada provada (08/10/2026, 21:26 UTC)

Mensagem de texto mandada de um celular para +55 16 99799-8152 chegou ao
webhook em producao: `webhook whatsapp: SEM_LEMBRETE {"intencao":"NAO_ENTENDI","respondeu":false}`.
E o comportamento certo para uma mensagem solta — sem lembrete pendente, o
sistema nao responde. A primeira tentativa nao chegou: o celular guardava
sessao antiga do numero; apagar a conversa e mandar de novo resolveu.

## Como o envio se comporta

- Um aviso por canal: quem tem e-mail e WhatsApp recebe os dois, e ligar o
  WhatsApp hoje **nao** reenvia o e-mail de ontem (a chave de idempotencia e
  por canal).
- Erro que a Meta ja disse ser definitivo — modelo que nao existe, numero sem
  WhatsApp, token revogado — para na primeira tentativa. Insistir tres vezes no
  mesmo "nao" atrasa os avisos que dariam certo e gasta a nota do numero.
- Limite de taxa e erro do servidor da Meta contam tentativa e voltam na
  proxima rodada.
- Numero nao conectado nao e falha: os avisos ficam pendentes e saem no dia em
  que o escritorio conectar.

## O que o sistema avisa

| Quando | Para quem | Modelo |
|---|---|---|
| tarefa ou compromisso **designado a alguem** | so a pessoa designada | `birdjud_tarefa_designada` |
| audiencia, pericia ou compromisso **marcado** | quem vai comparecer | `birdjud_compromisso_marcado` |
| 3 dias, 24h e 1h antes | equipe e quem vai comparecer | `birdjud_lembrete_*` |
| publicacoes novas | equipe que quis receber | `birdjud_resumo_publicacoes` |
| o dia que tem algo | equipe que quis receber | `birdjud_resumo_do_dia` |
| **documento gerado** (contrato, procuracao, declaracao, recibo) | o cliente, em PDF | `birdjud_documento` |
| **mensagem que nao chegou** ao cliente | so quem enviou (ver docs/ENTREGA-DE-MENSAGENS.md) | `birdjud_mensagem_nao_entregue` |

Os dois primeiros saem **na hora**, nao na proxima rodada da fila: quem ficou
com a tarefa precisa saber agora. Sao gravados como qualquer outro aviso e a
rota enfileira um `LEMBRAR` logo atras, que o trabalhador pega em segundos.

**O aviso de designacao vai so para quem foi designado.** Tarefa que chega
para o escritorio inteiro e tarefa que cada um acha que e do outro — que e
exatamente o problema que ter responsavel resolve. E quem designa para si
mesmo nao recebe nada: acabou de digitar.

**O aviso de "marcado" costuma sair na tela de participantes**, nao na de
criar: ao criar, o compromisso ainda nao tem participante nenhum. A chave leva
o participante, entao mexer na lista depois nao reavisa quem ja foi avisado.

## Mandar o documento pelo WhatsApp

Da propria conferencia da peca (ver `docs/MODELOS.md`): o PDF que esta na tela
sobe para a Meta e chega como anexo no celular do cliente.

O numero vem do **cadastro do cliente** e nao ha onde digitar outro, de
proposito: mandar a procuracao de uma pessoa para o telefone de outra nao da
erro nenhum, chega instantaneo e **nao se desfaz**. Cliente sem telefone, ou
com telefone que o sistema nao consegue ler, e recusado **antes** de subir o
arquivo — nao gasta mensagem nem sobe documento.

**Recibo com campo em branco nao sai.** Baixar um recibo com `[ --- ]` no
valor ja e ruim; manda-lo ao cliente e pior, porque sai da mao de quem
conferiria. Em branco, o valor vem da ultima cobranca paga — o mesmo caminho
da tela de gerar a peca, para que o recibo baixado e o mandado nunca digam
coisas diferentes.

Quem pediu para parar de receber **nao recebe nem documento**: o pedido vale
para tudo, e documento e a mensagem mais invasiva que o sistema manda.

Tecnicamente: o PDF nao vai dentro da mensagem. Sobe-se primeiro
(`POST /{numero}/media`), manda-se o id depois, num modelo aprovado **com
cabecalho do tipo documento** — modelo so de texto recebendo um PDF e
recusado, e a mensagem de erro da Meta nao diz que o problema e esse.

## Quando o aviso sai: a regua

Tres marcos, e nao um: **3 dias**, **24 horas** e **1 hora** antes.

Um aviso so, 24 horas antes, tem um problema pratico: nessa altura o cliente ja
nao consegue pedir folga no trabalho, nem remarcar a viagem, nem avisar que nao
vai — e o escritorio descobre a ausencia no dia. Tres dias antes da para se
organizar; 24 horas antes da para confirmar; uma hora antes da para sair de
casa.

**Cada marco so vale na sua faixa.** Sem faixa, um compromisso marcado para
amanha dispararia tambem o "faltam 3 dias", porque "faltam 3 dias ou menos"
tambem e verdade para ele — e o cliente receberia os dois avisos no mesmo
minuto.

| Tipo | Marcos |
|---|---|
| AUDIENCIA, PERICIA, COMPROMISSO | os tres |
| PRAZO, TAREFA | so o de 24 horas |

Encontro e lugar onde alguem precisa ESTAR, e tres avisos sao tres chances de
nao faltar. Prazo e tarefa sao trabalho do escritorio: tres avisos de cada
tarefa enchem o WhatsApp da equipe e ensinam todo mundo a ignorar o aviso, que
e o contrario do que se quer no dia do prazo.

A data na mensagem vem com quanto falta junto — "10/11/2026, 14:00 — e amanha"
—, porque "10/11" sozinho obriga quem le a fazer a conta.

Quem roda isso e o cron `cron-horario` (`LEMBRAR`), de hora em hora: marco de
uma hora com rotina diaria nunca dispararia. A chave de idempotencia leva o
marco, entao rodar de novo na mesma hora nao repete nada.

> O marco de 24 horas **nao** escreve o marco na chave, de proposito: e a chave
> que ja existia antes da regua. Se ganhasse prefixo, todo compromisso ja
> avisado ontem seria avisado de novo no primeiro dia depois do deploy.

## A resposta de quem recebe

O lembrete da audiencia sai sozinho. Ate aqui a resposta caia
no vazio: o escritorio so sabia que o cliente nao viria quando a cadeira ficava
vazia na frente do juiz.

Agora quem recebe responde, e o sistema le.

| O que a pessoa escreve | O que o sistema faz |
|---|---|
| `1`, `sim`, `ok`, `confirmo`, 👍 | marca **presenca confirmada** no participante e responde confirmando |
| `2`, `nao`, `nao posso`, `desmarcar`, 👎 | marca **nao podera ir** e responde que alguem do escritorio vai falar com ele |
| `parar`, `sair`, `descadastrar` | grava o bloqueio e **nao manda mais WhatsApp** para aquele numero, deste escritorio |
| qualquer outra coisa, inclusive audio | nao mexe em nada, responde que alguem vai ler, e aparece na **Agenda** em "Respostas no WhatsApp que ninguem leu" |

### As tres regras que importam

**1. A assimetria.** Marcar errado "nao vai" custa um telefonema. Marcar errado
"confirmado" custa uma audiencia em que o cliente nao aparece — e quem responde
por isso e o advogado, na frente do juiz. As duas leituras erradas nao tem o
mesmo preco, entao a duvida sempre cai para o lado de NAO confirmar:

- **negacao vence**: "nao confirmo" contem "confirmo", e uma busca ingenua por
  palavra marcaria a audiencia como confirmada;
- **mensagem comprida nunca confirma sozinha**: "vou tentar chegar no horario"
  e gente falando, e vai para uma pessoa ler.

**2. A resposta nao promete o que o sistema nao faz.** Quem diz que nao pode ir
recebe "anotamos; alguem do escritorio vai falar com voce; **o compromisso NAO
foi desmarcado**". Prometer em nome do escritorio e pior do que nao responder:
o cliente deixaria de ir a uma audiencia que continua marcada.

**3. Dois escritorios no mesmo telefone.** O mesmo numero pode ser cliente de
duas bancas da plataforma. Se as duas mandaram lembrete na mesma janela, o
sistema **nao age e nao responde**: dizer "confirmada a sua audiencia" a quem
nao e da banca certa contaria a um escritorio que aquela pessoa e cliente do
outro, e isso nao se desfaz. A mensagem fica guardada sem dono, invisivel para
os dois, e visivel so para o suporte da plataforma.

A resposta e ligada ao **lembrete que ela responde** — nao ao numero que
recebeu. E o que faz a conta fechar igual se um dia o WhatsApp virar um numero
unico da plataforma.

### Parar de receber

Nao basta desligar o aviso do compromisso de hoje: a audiencia do mes que vem
geraria outro lembrete, e o pedido da pessoa teria durado tres semanas. O
bloqueio e por telefone e por escritorio, e e conferido na GERACAO do aviso —
nao na hora de enviar, senao o aviso ficaria para sempre na fila somando
tentativa. **O e-mail continua**: o pedido foi sobre o WhatsApp.

### Ligar o webhook

Duas variaveis, e as duas andam juntas (`conferir-producao` reclama se so uma
estiver definida):

| Variavel | O que e |
|---|---|
| `WHATSAPP_VERIFICACAO` | qualquer segredo. A Meta devolve uma vez, ao ligar o webhook, e so aceita o endereco se bater. |
| `WHATSAPP_APP_SECRET` | o **App Secret** do aplicativo na Meta. Confere a assinatura de cada chamada. |

Endereco a cadastrar na Meta, em **Configuracao > Webhooks**, campo
`messages`:

```
https://<dominio>/api/webhooks/whatsapp
```

AO CONTRARIO do webhook da InfinitePay, este e **assinado**: a Meta manda
`X-Hub-Signature-256` com o HMAC do corpo cru. Por isso da para confiar no que
chegou e agir na hora, sem uma segunda consulta. Sem o segredo configurado a
rota responde 503 — processar chamada nao assinada deixaria qualquer um
confirmar a audiencia de qualquer cliente.

A Meta **reentrega** o mesmo evento quando a nossa resposta demora. O id da
mensagem tem indice unico, e a linha e gravada ANTES de qualquer acao: quem
perde a corrida descobre na hora, e o cliente nao recebe a resposta automatica
duas vezes.

### O limite de hoje

A credencial de WhatsApp e **de cada escritorio** (Integracoes), mas o webhook
de entrada e **um so**, com um unico `WHATSAPP_APP_SECRET` — o do aplicativo da
plataforma na Meta. Escritorio que usa aplicativo PROPRIO na Meta assina com
outro segredo, e a chamada dele seria recusada. Enquanto a entrada for assim, o
caminho completo (lembrete sai, cliente responde, agenda atualiza) depende de o
numero estar sob o aplicativo da plataforma.

## Custo

A Meta cobra por conversa iniciada pelo escritorio, na categoria do modelo
(utilidade e mais barata que marketing). Isso e entre o escritorio e a Meta. A
plataforma mede `WHATSAPP_MSG` para a franquia do modulo e para o excedente da
fatura — sao duas contas diferentes, e a nossa nao substitui a da Meta.

## Para testar sem a Meta

`META_BASE_URL` aponta a API para outro endereco. E assim que a bateria roda
(um HTTP local no lugar da Meta) e como se confere o formato do que sai sem
mandar mensagem de verdade. Em producao, vazia.
