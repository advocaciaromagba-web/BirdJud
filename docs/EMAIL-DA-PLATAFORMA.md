# O remetente da plataforma

Duas caixas de e-mail diferentes convivem no BirdJud, e trocar uma pela outra
e um erro caro:

| quem manda | de onde sai | para que serve |
| --- | --- | --- |
| **o escritorio** | SMTP que ele conectou em Integracoes | aviso de prazo, resumo do dia, mensagem para o cliente dele |
| **a plataforma** | `PLATAFORMA_SMTP_*` | recuperacao de senha e convite de usuario novo |

O cliente do escritorio tem de receber do advogado, nao de nos — por isso o
primeiro existe. E a recuperacao de senha nao pode depender de o escritorio
ter configurado e-mail (quem esqueceu a senha pode ser justamente quem ia
configurar) — por isso o segundo.

## As variaveis

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
