# O remetente da plataforma

Duas caixas de e-mail diferentes convivem no BirdJud, e trocar uma pela outra
e um erro caro:

| quem manda | de onde sai | para que serve |
| --- | --- | --- |
| **o escritorio** | SMTP que ele conectou em Integracoes | aviso de prazo, resumo do dia, mensagem para o cliente dele |
| **a plataforma** | rele de e-mail na Vercel (`EMAIL_RELE_*`) | recuperacao de senha, convite de usuario novo, aviso do vigia |

O cliente do escritorio tem de receber do advogado, nao de nos — por isso o
primeiro existe. E a recuperacao de senha nao pode depender de o escritorio
ter configurado e-mail (quem esqueceu a senha pode ser justamente quem ia
configurar) — por isso o segundo.

## O bloqueio de SMTP, e por que existe um rele

O Railway **bloqueia saida SMTP**. Medido, nao suposto:

```
smtp.gmail.com:587 -> ETIMEDOUT em ~250 ms
smtp.gmail.com:465 -> ETIMEDOUT em ~250 ms
smtp.gmail.com:25  -> ETIMEDOUT em ~250 ms
api.resend.com:443 -> abriu em 8 ms
```

Provedor de nuvem faz isso para conter spam. O sintoma — "connection timeout" —
e identico ao de senha errada, e isso custou uma troca de senha de aplicativo e
uma troca de porta antes de alguem medir. **Nenhuma senha do Google resolve
isso**: a conexao nao chega ao Google.

A decisao foi manter o Gmail, e nao trocar por servico de envio. Entao quem
fala SMTP com o Gmail e o rele na Vercel (`rele/api/email.ts`, regiao gru1), que
a aplicacao chama por HTTPS — porta 443, que o Railway libera. O mesmo projeto
da Vercel que ja hospeda o rele do DJEN, com **token proprio**: quem
comprometer o envio de e-mail nao leva junto o token do DJEN.

```
aplicacao (Railway)  --HTTPS-->  rele (Vercel, gru1)  --SMTP 465-->  Gmail
```

O rele fixa o remetente pelo ambiente **dele**: quem chama nao escolhe de quem
o e-mail parece vir, e cada chamada leva um destinatario so.

## As variaveis

### Caminho escolhido: rele de e-mail

No Railway (aplicacao e servicos que mandam e-mail):

```
EMAIL_RELE_URL=https://birdjud-rele.vercel.app/api/email
EMAIL_RELE_TOKEN=<o mesmo valor de EMAIL_TOKEN na Vercel>
```

Na Vercel, projeto `birdjud-rele`:

```
EMAIL_TOKEN=<segredo compartilhado com o Railway>
GMAIL_USUARIO=blackbirdnotifica@gmail.com
GMAIL_SENHA=<senha de aplicativo de 16 letras, sem espacos>
GMAIL_REMETENTE=BirdJud <blackbirdnotifica@gmail.com>
GMAIL_RESPONDER_PARA=blackbirdnotifica@gmail.com
```

Para conferir se a Vercel alcanca o Gmail, sem enviar nada:

```
curl -H "Authorization: Bearer $EMAIL_TOKEN" \
  "https://birdjud-rele.vercel.app/api/email?diagnostico=1"
```

### Caminhos alternativos (em ordem de preferencia do codigo)

```
PLATAFORMA_SMTP_HOST=
PLATAFORMA_SMTP_PORTA=587
PLATAFORMA_SMTP_USUARIO=
PLATAFORMA_SMTP_SENHA=
PLATAFORMA_REMETENTE="BirdJud <blackbirdnotifica@gmail.com>"
PLATAFORMA_RESPONDER_PARA=
```

Faltando qualquer uma das quatro primeiras, ou o remetente, a tela de
recuperacao diz que a recuperacao automatica nao esta disponivel — em vez de
fingir que o e-mail saiu e deixar a pessoa esperando por um link que nunca
chega.

Com `EMAIL_RELE_*` configurado, nada abaixo e usado. `RESEND_API_KEY` vem
depois dele, e o SMTP direto por ultimo — este so funciona em servidor proprio,
por causa do bloqueio descrito acima.

## Caminho 1: conta do Google com senha de aplicativo

O mais rapido, e o suficiente para o piloto.

1. na conta `blackbirdnotifica@gmail.com`, ligar a verificacao em duas etapas
   (sem ela o Google nao oferece senha de aplicativo);
2. em myaccount.google.com/apppasswords, gerar uma senha de aplicativo. Sao 16
   letras, que aparecem **uma unica vez**;
3. preencher:

```
PLATAFORMA_SMTP_HOST=smtp.gmail.com
PLATAFORMA_SMTP_PORTA=587
PLATAFORMA_SMTP_USUARIO=blackbirdnotifica@gmail.com
PLATAFORMA_SMTP_SENHA=<a senha de aplicativo, sem espacos>
PLATAFORMA_REMETENTE="BirdJud <blackbirdnotifica@gmail.com>"
```

O que esperar: o Google limita a algo em torno de 500 mensagens por dia, o que
sobra para recuperacao de senha. A mensagem sai com um aviso discreto de que
foi enviada por terceiro em alguns clientes de e-mail.

## Caminho 2: servico de envio (quando o piloto virar produto)

Resend, Brevo, SendGrid e Postmark funcionam sem mudar uma linha de codigo:
mudam so as variaveis. O ganho nao e o volume — e a **entregabilidade**.

A diferenca esta em quem assina o dominio. Servico de envio pede para
verificar um dominio seu (`birdjud.com.br`), publicar SPF e DKIM no DNS, e a
partir dai a mensagem sai assinada por voce. Isso e o que mantem a
recuperacao de senha fora da caixa de spam — que, para este tipo de mensagem,
e a diferenca entre o escritorio entrar e o escritorio ligar reclamando.

Quando for a hora, o remetente vira algo como
`BirdJud <nao-responda@birdjud.com.br>`, com
`PLATAFORMA_RESPONDER_PARA=blackbirdnotifica@gmail.com` para que a resposta
continue chegando na caixa de sempre.

Nao da para verificar `gmail.com` em um servico de envio: o dominio nao e
seu. Por isso o caminho 1 usa o SMTP do proprio Google, e nao um servico
mandando em nome do Gmail — isso seria barrado pelo DMARC do Google.

## Onde definir, em producao

No Railway, no servico `aplicacao`: **Variables → New Variable**, uma a uma.
O deploy reinicia sozinho quando a variavel muda.

A senha de aplicativo e um segredo: vale a mesma regra do resto — ela vive na
variavel de ambiente do Railway, nunca no repositorio.

## Como conferir que funciona

```
npm run conferir-recuperacao
```

Sobe um SMTP de mentira, sobe a aplicacao apontando para ele, pede o link
pela rota publica, le o link do e-mail que chegou e troca a senha. Depois
confere que a senha nova entra, que o mesmo link nao serve duas vezes e que a
resposta e identica para conta que existe e para conta que nao existe.

Nao usa a internet nem credencial de verdade: prova o fluxo, nao a conta.
