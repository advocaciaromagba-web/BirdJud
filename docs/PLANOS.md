# Planos de assinatura

A regra comercial em uma frase: **o escritorio monta o que quer, e nunca paga
mais do que o plano pronto que ja lhe daria aquilo.**

## A escada

| plano | o que entra alem do sistema | 1 advogado | ate 3 | ate 10 | ate 25 | acima |
| --- | --- | --- | --- | --- | --- | --- |
| Essencial | nada — clientes, processos, agenda e prazos, com cadastro digitado a mao | **199** | 279 | 449 | 749 | sob consulta |
| Profissional | publicacoes do DJEN, arquivos, aviso por e-mail | 239 | 319 | 519 | 849 | sob consulta |
| Avancado | + cobrancas, financeiro, nota fiscal de servico | 269 | 359 | 579 | 949 | sob consulta |
| Completo | + inteligencia artificial, aviso por WhatsApp, assinatura eletronica | **299** | 399 | 649 | 1.049 | sob consulta |

O sistema **comeca no advogado sozinho**. E dele que sai o piso de R$ 199, e e
por essa faixa que todo escritorio novo entra — so sobe quando tiver gente
para isso. A faixa Solo tem uma vaga de advogado e duas de apoio, porque quem
advoga sozinho quase nunca trabalha sozinho.

**A faixa de 50 advogados nao tem preco na vitrine.** Escritorio desse tamanho
no Brasil e escritorio grande: tem sistema, negocia, compara proposta, e o
preco depende de migracao e de volume proprio de uso. Tabela publica nessa
faixa so ancora a conversa no numero errado — e a ancora util e o Completo de
R$ 299 para escritorio pequeno. O preco continua existindo no sistema
(`PRECO_DO_PLANO`) como **referencia interna** de quem monta a proposta, e
continua obedecendo a escada; quem decide o que aparece na tela e
`FAIXAS_PUBLICADAS`, em `catalogo.ts`.

Dois numeros amarram a tabela, e o resto se acomoda entre eles:

- **R$ 199**, o piso: o sistema simples, sem IA, para um advogado. Abaixo disso a conta nao
  fecha, porque o escritorio pequeno usa o mesmo servidor, o mesmo banco
  isolado e o mesmo suporte do grande;
- **R$ 299**, o Completo para quem advoga sozinho: e o que o mercado brasileiro
  cobra por sistema "completo" dessa faixa. O BirdJud entrega mais por esse
  preco — leitura de documento por IA, entre outras coisas — e nao cobra mais
  por isso, porque o escritorio compara a primeira linha da tabela, nao a
  lista de recursos.

Os cem reais entre um e outro sao curtos de proposito: quem chega pelo piso e
ve que a IA, a cobranca e a nota fiscal cabem em mais cem, sobe — e e no
Completo que o produto se defende. Ha um teste que prende os dois numeros e
exige que todo plano da faixa de entrada caiba entre eles.

Tres invariantes, garantidas por teste em `testes/planos.test.ts`:

1. cada plano **contem** o anterior. A escada nao tem degrau para tras;
2. quanto mais completo, mais caro — em todas as faixas de tamanho;
   e todo pacote sai mais barato que os mesmos modulos avulsos, tambem em
   todas elas;
3. o plano Completo contem **todo** modulo que a plataforma cobra. Se um
   modulo novo entrar no catalogo com preco e ficar fora do Completo, o teste
   quebra: a vitrine nao pode prometer "tudo" e entregar menos.

## Por que existe plano pronto se da para montar

Porque escolher entre nove modulos e trabalho, e porque o pacote sai mais
barato que a soma. Esse desconto e o que paga a escolha de levar o conjunto.

E por que `contaMontada()` sobe para um plano pronto quando ele cobre o que
foi pedido e sai mais barato: cobrar a soma avulsa quando existe pacote mais
barato cobrindo o mesmo seria ganhar do cliente por ele nao conhecer a tabela.
Nesse caso o escritorio leva de brinde o que sobra do plano.

## Por que o modulo avulso custa mais no escritorio maior

`precoDoModulo()` multiplica o preco de tabela pelo fator da faixa. Nao e
ganancia: enquanto os modulos tinham preco fixo e so a faixa crescia, a soma
avulsa passava por baixo do pacote nas faixas grandes. Como `contaMontada()`
sempre cobra o menor dos dois, o preco de tabela do plano simplesmente deixava
de valer — um escritorio de 25 advogados nunca pagaria o Avancado, pagaria
sempre a soma. O fator restaura a escada.

## Franquia: o detalhe que sustenta o preco

`consumoDoMes` trata franquia nula como **ilimitada** — nada vira excedente.
Modulo contratado sem franquia gravada e consumo de graca, e com IA a R$ 59 um
escritorio lendo mil documentos por mes custaria a plataforma varias vezes a
mensalidade sem que ninguem percebesse.

Por isso ninguem faz upsert em `ModuloContratado` direto: passa por
`src/lib/contratacao.ts`, que grava sempre a franquia da faixa. E mudar a
faixa reescreve as franquias, senao o escritorio que cresceu continuaria
pagando excedente do tamanho antigo.

Franquias mensais na faixa menor: 150 mil tokens de IA (algo como dez a trinta
leituras de documento por semana), 200 mensagens de WhatsApp, mil e-mails, 20
notas, 30 cobrancas, 3 OABs e 5 GB. Todas crescem com a faixa.

## O que muda o preco

- **a faixa de tamanho** (ate 3, 10, 25 ou 50 advogados), que vale
  separadamente para advogados e para a equipe de apoio. So usuario ativo
  ocupa vaga;
- **os modulos** contratados;
- **o consumo que passa da franquia** — mensagem de WhatsApp, nota emitida,
  milhar de token de IA, MB guardado —, cobrado pelo que foi usado.

## Onde cada coisa vive

| arquivo | papel |
| --- | --- |
| `src/lib/catalogo.ts` | os modulos e as faixas (e o rotulo de cada tamanho). So constantes, sem Prisma |
| `src/lib/precos.ts` | a tabela: faixa, modulo, excedente |
| `src/lib/planos.ts` | os pacotes e as contas. Funcao pura, usada tambem no navegador |
| `src/lib/rotulos.ts` | como cada modulo se chama na tela |
| `/planos` | a vitrine, com simulador |
| `/plano` | o plano do escritorio, para quem administra a conta |
| painel da plataforma | aplicar um plano inteiro a um escritorio |

## Duas coisas que o sistema nao faz sozinho

**Nao troca o valor da assinatura.** `Assinatura.valorCentavos` e o preco
fechado com aquele escritorio; mudanca de tabela nao altera contrato
assinado, e aplicar um plano no painel nao mexe nesse valor. Quem fecha preco
e gente.

**Nao liga modulo por conta propria.** O escritorio ve o que da para
acrescentar e quanto custa, mas contratar e mudanca de contrato: passa pela
plataforma.

## O teste comeca completo

Quem se cadastra sem escolher nada comeca o teste com o plano Completo. Quem
esta avaliando precisa ver o sistema inteiro — inclusive a leitura por IA, que
e o que mais distingue o produto. Reduzir depois e conversa comercial;
comecar cego nao ajuda ninguem.

## Os valores sao provisorios

Como diz o topo de `precos.ts`: a tabela so pode ser fechada depois de
levantar custo real de servidor, IA, mensagem e e-mail, e de conferir o preco
dos concorrentes. Os descontos por plano estao na mesma condicao.
