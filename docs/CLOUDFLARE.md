# Pondo a Cloudflare na frente

Hoje todo pedido vai do visitante direto para a aplicacao: a resposta de
producao traz `server: railway-hikari`, e os nameservers do dominio ja sao da
Cloudflare mas so resolvem nome — a nuvem esta cinza. Ligar a nuvem laranja e
a unica defesa real contra derrubada, e e de graca.

Este documento e a ordem de fazer isso sem derrubar o sistema no caminho. Ele
existe porque tres detalhes aqui quebram producao em silencio, e nenhum deles
e obvio.

## O que foi conferido, e quando

Em 05/10/2026, na documentacao da Cloudflare:

- **A nuvem laranja no curinga funciona no plano gratis.** "Customers on all
  plans can create and proxy wildcard DNS records." Isso importa porque cada
  escritorio entra por `<slug>.birdjud.com.br`, que e um registro curinga. A
  informacao que circula em foruns — que proxy de curinga seria so no plano
  Enterprise — esta desatualizada; era verdade e deixou de ser.
- **O certificado gratis cobre o apice e UM nivel de subdominio.** E
  exatamente o que o sistema usa (`birdjud.com.br`, `app.birdjud.com.br`,
  `<slug>.birdjud.com.br`). Dois niveis (`a.b.birdjud.com.br`) nao sao
  cobertos — e o sistema nao usa.

## As tres armadilhas

**1. `_acme-challenge` tem de ficar CINZA.** O Railway renova o certificado
dele por validacao de DNS, com o registro

    _acme-challenge  CNAME  qj91rgxj.authorize.railwaydns.net

Se esse registro for para a nuvem laranja, a renovacao para de funcionar. O
certificado atual vence em 04/11/2026: a quebra so apareceria semanas depois,
e apareceria como o sistema inteiro inacessivel — foi isso que aconteceu em
28/09/2026, por outra razao. Esse registro fica cinza, sempre.

**2. O webhook de pagamento nao pode ser tratado como robo.** O Asaas chama
`app.birdjud.com.br/api/webhooks/asaas` sem navegador, sem JavaScript — o
perfil exato do que a protecao contra robos barra. Se ele for barrado, a
fatura e paga e o escritorio continua suspenso, e nada no sistema acusa. Antes
de ligar qualquer regra de robo, criar uma excecao (WAF > Custom rules, acao
*Skip*) para `/api/webhooks/*`.

**3. `ATRAS_DO_CLOUDFLARE=1` so DEPOIS, nunca antes.** Essa variavel manda o
sistema confiar no cabecalho `CF-Connecting-IP` para contar os tetos de
tentativa. A Cloudflare escreve esse cabecalho e apaga o que o visitante
mandar — mas so quando ela esta na frente. Ligada antes do proxy, ela entrega
de volta o buraco fechado em 7d04e74: qualquer um escolheria a propria origem
e desligaria todos os tetos.

## Ordem

Escalonada de proposito: o que é certo primeiro, o que depende de
certificado novo depois, cada passo conferido antes do seguinte. Tudo e
reversivel em um clique.

1. **SSL/TLS > Overview: modo `Full (strict)`.** Qualquer modo abaixo disso
   deixa o trecho Cloudflare-Railway sem verificacao, e `Flexible` chega a
   quebrar o sistema (a aplicacao recebe HTTP e manda o navegador para HTTPS
   em laco).
2. **Nuvem laranja em `birdjud.com.br` e `app.birdjud.com.br`.** Conferir:
   `curl -sI https://birdjud.com.br/ | grep -i server` deve deixar de dizer
   `railway-hikari`. Entrar no sistema, abrir o console da plataforma.
3. **`ATRAS_DO_CLOUDFLARE=1`** nas variaveis de `aplicacao` (e so depois do
   passo 2 estar conferido).
4. **Nuvem laranja no curinga `*`.** Conferir um subdominio de escritorio de
   verdade: ele tem de abrir com certificado valido. Se nao abrir, voltar o
   curinga para cinza — so os escritorios ficam de fora, o resto continua
   protegido.
5. **Excecao de WAF para `/api/webhooks/*`** antes de ligar protecao contra
   robos.

## Depois: o vigia

O vigia ja esta preparado. Com a Cloudflare na frente, o certificado que o
nome publico apresenta passa a ser o dela, sempre valido — e o do Railway
venceria em silencio. Por isso `VIGIA_CERTIFICADOS` lista os quatro alvos:

    birdjud.com.br@tzp59u2a.up.railway.app
    app.birdjud.com.br@qj91rgxj.up.railway.app
    birdjud.com.br
    app.birdjud.com.br

Os dois primeiros batem na ORIGEM e julgam contra o nome publico; os dois
ultimos batem onde o visitante bate. Os dois lados importam: a borda errada e
a origem errada sao problemas diferentes, com remedios diferentes.
