# Modelos de documento do escritorio

Contrato de honorarios, procuracao e declaracao de hipossuficiencia saem no
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
