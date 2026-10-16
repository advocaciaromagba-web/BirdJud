# Planos de assinatura

A regra comercial em uma frase: **o escritorio monta o que quer, e nunca paga
mais do que o plano pronto que ja lhe daria aquilo.**

## A escada

| plano | o que entra alem do sistema | 1 advogado | ate 3 | ate 10 | ate 25 | acima |
| --- | --- | --- | --- | --- | --- | --- |
| Essencial | nada — clientes, processos, agenda e prazos, com cadastro digitado a mao | **149** | 209 | 339 | 559 | sob consulta |
| Profissional | publicacoes do DJEN, arquivos, aviso por e-mail | 189 | 249 | 409 | 669 | sob consulta |
| Avancado | + cobrancas, financeiro, nota fiscal de servico | 229 | 309 | 489 | 809 | sob consulta |
| Completo | + inteligencia artificial, aviso por WhatsApp, assinatura eletronica | **279** | 369 | 609 | 979 | sob consulta |

**Tabela fechada em 14/10/2026** (entrada mais baixa), depois de medir o custo
real da infraestrutura (perto de US$ 30/mes no total, nao por escritorio) e
comparar com Astrea, ADVBOX, Projuris e EasyJur, que entram entre R$ 89 e
R$ 229 e cobram IA a parte ou adesao. Teste gratis de 14 dias. Plano anual
com **10% de desconto** (ver "Assinatura anual").

O sistema **comeca no advogado sozinho**. E dele que sai o piso de R$ 149, e e
por essa faixa que todo escritorio novo entra — so sobe quando tiver gente
para isso. A faixa Solo tem uma vaga de advogado e duas de apoio, porque quem
advoga sozinho quase nunca trabalha sozinho.

**A faixa de 50 advogados nao tem preco na vitrine.** Escritorio desse tamanho
no Brasil e escritorio grande: tem sistema, negocia, compara proposta, e o
preco depende de migracao e de volume proprio de uso. Tabela publica nessa
faixa so ancora a conversa no numero errado — e a ancora util e o Completo de
R$ 279 para escritorio pequeno. O preco continua existindo no sistema
(`PRECO_DO_PLANO`) como **referencia interna** de quem monta a proposta, e
continua obedecendo a escada; quem decide o que aparece na tela e
`FAIXAS_PUBLICADAS`, em `catalogo.ts`.

Dois numeros amarram a tabela, e o resto se acomoda entre eles:

- **R$ 149**, o piso: o sistema simples, sem IA, para um advogado. Abaixo disso a conta nao
  fecha, porque o escritorio pequeno usa o mesmo servidor, o mesmo banco
  isolado e o mesmo suporte do grande;
- **R$ 279**, o Completo para quem advoga sozinho: e o que o mercado brasileiro
  cobra por sistema "completo" dessa faixa. O BirdJud entrega mais por esse
  preco — leitura de documento por IA, entre outras coisas — e nao cobra mais
  por isso, porque o escritorio compara a primeira linha da tabela, nao a
  lista de recursos.

Os R$ 130 entre um e outro sao curtos de proposito: quem chega pelo piso e
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

## Assinatura anual

Desde 14/10/2026: **10% de desconto** (`DESCONTO_ANUAL` em `precos.ts`) para
quem paga o ano. `Assinatura.ciclo` = MENSAL | ANUAL, trocado no console da
plataforma ("Passar para anual").

- a fatura anual e **12 x a mensalidade fechada**, com o desconto em linha
  propria, e marca `anualAte`: um ano depois do fim do teste ou do fim do ano
  anterior (a regua atrasar uns dias nao encurta o ano). Se esse marco tem
  mais de 35 dias — quem foi mensal por meses e so agora passou ao anual —, o
  ano conta **do dia da fatura** (`inicioDoAno`);
- no Asaas e no e-mail a cobranca sai como "assinatura anual (12 meses) a
  partir de MM/AAAA", nao como a mensalidade do mes (`ehFaturaAnual`);
- nos meses do meio, so sai fatura se houver **excedente de consumo** (sem
  desconto);
- acabado o ano, a regua emite a proxima fatura anual;
- voltar ao mensal deixa o ano pago valer ate o fim: enquanto `anualAte` esta
  no futuro, a regua nao cobra mensalidade, **em qualquer ciclo**. Por isso o
  console recusa voltar ao mensal com a fatura anual ainda em aberto (seria
  nao pagar nenhuma das duas).

### Anual parcelado no cartao (16/10/2026)

A fatura anual sai como cobranca unica (boleto, Pix ou cartao a vista). Na
tela **Plano**, o administrador do escritorio ve as faturas em aberto e, na
anual, o botao **"Parcelar em ate 12x no cartao"** (`PARCELAS_DO_ANUAL`, sem
juros para o escritorio — a taxa do parcelamento do Asaas fica com a BirdJud).
O e-mail da fatura anual avisa dessa opcao com o endereco da tela.

`parcelarFaturaNoCartao` (cobranca-plataforma.ts), nesta ordem:

1. confere no Asaas que a cobranca a vista nao foi paga (se foi, recusa);
2. cancela a a vista no Asaas e **limpa o id na fatura**;
3. cria o parcelamento (`billingType: CREDIT_CARD`, `installmentCount`,
   `totalValue`, mesma `externalReference`) e guarda `idExterno`,
   `parcelamentoId`, `parcelas` e o novo link.

Nunca ha duas cobrancas vivas para a mesma fatura. Se o Asaas cair entre 2 e
3, a fatura fica ABERTA sem cobranca e a proxima regua emite a a vista de
novo. Pedir duas vezes devolve o mesmo link.

Webhook: a primeira parcela confirmada da baixa na fatura inteira (no cartao
o valor todo fica comprometido na hora); as outras 11 chegam como "ja
processada". Parcela que chegue sem a nossa referencia e achada pelo
`parcelamentoId`. A baixa guarda `parcelamento` e `parcelas`, e o console
mostra "parcelado em 12x (valor da parcela)".

Junto (16/10/2026): o vencimento minimo (emissao + 5 dias) passou a ser o dia
de Brasilia ao meio-dia UTC (`meioDiaDoDia`) — fatura emitida depois das 21h
ia ao Asaas com vencimento um dia depois do que a tela e o e-mail diziam. E
modulo com nome fora do catalogo na tabela e ignorado (`modulosAtivos`,
`itensDaFatura`): antes tirava o escritorio do preco do pacote.

Prova de ponta a ponta (15/10/2026, app local + Asaas simulado): passar para
anual no console → regua emite R$ 3.013,20 (Completo solo) descrita como
anual → voltar ao mensal recusado (409) → webhook PAYMENT_RECEIVED da baixa,
escritorio ATIVO → voltar ao mensal aceito → regua nao gera mensalidade.

## O que a fatura cobra (corrigido em 14/10/2026)

A fatura cobra o **valor fechado na assinatura** (`Assinatura.valorCentavos`).
Ate 14/10/2026 ela recalculava pela tabela, somando a faixa e o preco de
tabela de cada modulo — sem o pacote e sem o fator da faixa: um escritorio no
Completo pagaria a soma avulsa (R$ 386 no solo, contra R$ 279 na vitrine), e
toda mudanca de tabela mudaria contrato assinado. Sem valor gravado, vale a
conta da vitrine (`contaMontada`). Testes em `testes/assinatura-anual.test.ts`.

## O teste comeca completo

Quem se cadastra sem escolher nada comeca o teste com o plano Completo. Quem
esta avaliando precisa ver o sistema inteiro — inclusive a leitura por IA, que
e o que mais distingue o produto. Reduzir depois e conversa comercial;
comecar cego nao ajuda ninguem.

## Os valores

Fechados em 14/10/2026 (ver o topo). Revisar quando houver escritorios
pagando e consumo real de IA e mensagens por varios meses: as franquias e o
excedente sao o que protege a margem.
