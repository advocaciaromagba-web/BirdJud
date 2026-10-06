# Modelos de documento do escritorio

Contrato de honorarios, procuracao, declaracao de hipossuficiencia e recibo de
pagamento de honorarios saem no
papel do escritorio: o timbre dele, a fonte dele, a redacao que o advogado dele
assina. O sistema guarda o `.docx` que o escritorio enviou e troca so os campos
marcados.

## Por que nao ha editor aqui dentro

O caminho e: **baixar o modelo que esta valendo, editar no Word, devolver**.
"Usar o que ja vem" e "mandar o meu" sao o mesmo caminho, com um passo no meio.

Um editor na tela obrigaria o escritorio a refazer, dentro do sistema, o papel
que ele ja tem pronto — e perderia o timbre, a margem e as clausulas que a
banca levou anos ajustando. O `.docx` dele entra e sai inteiro: de tudo que
esta no arquivo, so o texto dos campos e mexido.

## Os campos

Escritos entre chaves duplas, como `{{cliente.nome}}`. A lista vive em
`src/lib/modelos.ts` (`CAMPOS`) e aparece inteira na tela de Modelos.

Tres regras, e as tres existem para que o erro apareca:

| Situacao | O que acontece | Por que |
|---|---|---|
| Campo conhecido, com valor | vira o valor | — |
| Campo conhecido, sem valor no cadastro | vira `[ --- ]` | em branco, a peca sai com um buraco no lugar do valor dos honorarios e ninguem ve |
| Campo que o sistema nao conhece | fica escrito como esta | `{{cliente.nomee}}` tem de aparecer na peca, senao o escritorio nunca descobre que digitou errado |

A tela avisa das duas ultimas no envio do modelo **e** na previa da peca —
antes do download, nao depois.

## A armadilha do Word

O Word quebra uma palavra em varios `<w:r>` sem avisar: basta alguem ter
passado o corretor ortografico. No arquivo, `{{cliente.nome}}` vira algo como
`{{cli` + `ente.` + `nome}}`.

Uma troca ingenua nao acha nada **e sai calada**, com a peca inteira errada.
Por isso `src/lib/modelos.ts` junta o texto do paragrafo antes de procurar e
devolve o resultado pedaco a pedaco. O teste `campo repartido pelo Word` em
`testes/modelos.test.ts` e o que justifica o arquivo existir.

A juncao e **por paragrafo**, nao pelo documento inteiro: um `{{` perdido no
fim de um paragrafo nao pode casar com um `}}` de outro e comer o texto do meio.

## O que vem no sistema

`src/lib/modelos-padrao.ts`, em texto legivel, nao em binario — para poder ser
lido e revisado como qualquer outro codigo.

**Nao e a peca pronta de ninguem.** E o ponto de partida, para um escritorio
novo conseguir emitir no primeiro dia. Antes de usar como esta, o advogado
responsavel le e adapta: a redacao e a responsabilidade sao do escritorio, e a
tela diz isso.

## Onde se gera

Na ficha do cliente, em **Gerar documentos**: marca-se o que precisa e sai de
uma vez. Quase sempre sao os tres juntos — contrato, procuracao e declaracao —
e obrigar tres idas a tela para o que e um gesto so era pedir que alguem
esquecesse um.

O **recibo** precisa de um pagamento. Em branco, sai da ultima cobranca paga do
cliente. Dinheiro que entrou por fora do sistema precisa ser digitado: inventar
o numero de um recibo seria dar quitacao de um valor que ninguem conferiu.

Os honorarios podem ser lancados **junto com o cadastro do cliente**, no mesmo
formulario. Se o contrato falhar, o cliente fica cadastrado do mesmo jeito —
perder o cadastro inteiro por causa de um campo de honorario seria pior que
ficar sem o contrato, que da para lancar depois na ficha.

## Como se contrata

Duas dimensoes independentes, e nao uma lista de tipos:

- **parte fixa**: valor total, quanto dele e **entrada** (a vista, na
  assinatura) e em quantas **parcelas** o que sobra e dividido;
- **parte de exito**: percentual.

Daí saem todas as formas de uma vez: a vista (1 parcela, sem entrada),
parcelado (N parcelas), **a vista mais parcelamento** (entrada + N parcelas),
so exito (sem valor fixo) e misto (fixo + exito). O nome — `a vista`, `3x`,
`entrada mais 3x + 30% de exito` — e DERIVADO dos numeros, nunca gravado:
gravar "a vista" e depois alguem mudar para 3 parcelas deixaria um contrato que
se diz uma coisa e cobra outra.

Com entrada, a primeira parcela vence no mes SEGUINTE a ela: cobrar as duas no
mesmo dia e cobrar duas vezes no dia da assinatura. E "entrada mais 3x" gera
QUATRO cobrancas, nao tres.

A forma de pagamento — boleto, Pix, cartao, ou o cliente escolhe — e do
contrato e entra na peca.

## Historico

Modelo trocado vira inativo em vez de sumir. A peca que saiu ontem saiu daquele
texto, e um dia alguem vai perguntar qual era. Um indice unico PARCIAL garante
"um ativo por especie" sem impedir varios inativos (ver `28_modelos`).

Quem troca o modelo e so o ADMIN do escritorio. Baixar, qualquer usuario pode.

## Limites conhecidos

- Cabecalho e rodape **sao** preenchidos (`header*.xml`, `footer*.xml`), que e
  onde costuma morar o timbre. A previa na tela mostra so o corpo.
- Saida em `.docx`. Nao ha conversao para PDF aqui.
- Campo dentro de caixa de texto ou de tabela aninhada em desenho pode nao ser
  alcancado, pelo mesmo motivo: fica fora do corpo do documento.
