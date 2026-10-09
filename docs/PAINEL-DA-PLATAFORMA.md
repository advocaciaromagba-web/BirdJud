# Painel da plataforma

`/plataforma`, so para operador. A carteira da Blackbird em numeros, graficos
e uma analise escrita. A lista de escritorios foi para `/plataforma/escritorios`.

## Os numeros, e o que cada um quer dizer

| numero | definicao |
| --- | --- |
| receita mensal | soma das assinaturas de ATIVO e INADIMPLENTE (inadimplente continua devendo); suspenso, encerrado e cancelado fora |
| ticket medio | receita mensal / pagantes |
| escritorios | todos menos os encerrados |
| vencido | faturas ABERTAS com vencimento antes de hoje |
| recebido no mes | faturas PAGAS, pelo mes do pagamento (nao da competencia) |
| previsto | garantido = assinaturas pagantes; testes = quem sai do teste antes do vencimento daquele mes, SE assinar. Sempre separados |

## Os graficos

- **Pizza: escritorios por situacao** — ativos, em teste, inadimplentes,
  suspensos, encerrados.
- **Pizza: receita mensal por faixa** — Solo a Corporativo.
- **Pizza: vencido por tempo de atraso** — ate 15, 16 a 30, 31 a 60, mais de
  60 dias.
- **Colunas: previsao de recebimentos** — seis meses, garantido e testes
  empilhados.
- **Colunas: recebido** — seis meses para tras.

Toda pizza tem a legenda com valor e percentual escritos (e a tabela do
grafico); as colunas tem o total em cima e "Ver em tabela". Passar o mouse
mostra o valor de cada fatia ou pedaco.

Cores conferidas com o validador de paleta (daltonismo, contraste, faixa de
luminosidade): categorica em ordem fixa azul `#2a78d6`, laranja `#eb6834`,
verde-agua `#1baf7a`, amarelo `#eda100`, magenta `#e87ba4`; ordinal (mais =
mais escuro) num azul so, `#86b6ef` a `#104281`. Tres categoricas ficam abaixo
de 3:1 sobre o branco — por isso nenhum valor depende so da cor.

## A analise escrita

Uma frase por fato, e so o que pede atencao ou decisao: receita e ticket;
quanto os testes acrescentam se assinarem; vencido e % da receita; o que passa
de 60 dias; o maior devedor; testes terminando em 7 dias; concentracao (um
escritorio com 30% ou mais da receita); os proximos 3 meses garantidos e com
testes; o recebido do mes contra o anterior.

## Onde esta no codigo

- `src/lib/painel-plataforma.ts` — a conta inteira, funcao pura
- `src/componentes/GraficosDoPainel.tsx` — pizza, colunas e cartao de numero, em SVG
- `src/app/plataforma/page.tsx`
- testes: `testes/painel-plataforma.test.ts`, com uma carteira de datas e valores conhecidos
