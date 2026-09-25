# Planos de assinatura

A regra comercial em uma frase: **o escritorio monta o que quer, e nunca paga
mais do que o plano pronto que ja lhe daria aquilo.**

## A escada

| plano | o que entra alem do sistema | desconto nos modulos |
| --- | --- | --- |
| Essencial | nada — clientes, processos, agenda e prazos, com cadastro digitado a mao | — |
| Profissional | publicacoes do DJEN, arquivos, aviso por e-mail | 10% |
| Avancado | + cobrancas, financeiro, nota fiscal de servico | 20% |
| Completo | + inteligencia artificial, aviso por WhatsApp, assinatura eletronica | 30% |

Tres invariantes, garantidas por teste em `testes/planos.test.ts`:

1. cada plano **contem** o anterior. A escada nao tem degrau para tras;
2. quanto mais completo, mais caro — em todas as faixas de tamanho;
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
| `src/lib/catalogo.ts` | os modulos e as faixas. So constantes, sem Prisma |
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
