# Publicacoes: da captura a agenda

O caminho de uma publicacao, do diario ate virar trabalho marcado.

## O problema que isto resolve

A publicacao chegava, era lida e morria na lista. Quem quisesse transformar em
prazo ou em audiencia reabria a agenda e digitava tudo de novo — numero do
processo, titulo, data contada a mao. **O que nao se digita de novo nao entra,
e prazo que nao entra na agenda e prazo perdido.**

## A regra de classificacao

Uma linha, sem excecao:

| O ato exige | Vira |
|---|---|
| **ESTAR** em algum lugar — audiencia, pericia, atendimento, sessao, oitiva, inspecao | **AGENDAMENTO** |
| **ESCREVER** alguma coisa — peticionar, manifestar, contestar, impugnar, recorrer, juntar, cumprir | **TAREFA** |

Na duvida entre as duas, **AGENDAMENTO vence**: perder uma audiencia custa mais
que escrever uma peca um dia antes.

Cada especie vira um tipo de compromisso na agenda: audiencia vira AUDIENCIA,
pericia vira PERICIA, o resto dos encontros vira COMPROMISSO, e tarefa vira
TAREFA. Isso importa porque a regua de lembretes trata encontro e trabalho de
forma diferente (ver `docs/WHATSAPP.md`).

## O prazo: duas datas, nunca uma

> **O prazo fatal vai preenchido. A data sugerida fica tres dias uteis antes.**

Marcar a tarefa para o dia do vencimento e marcar para o dia em que nao da mais
para errar. Por isso o aceite de uma sugestao de **TAREFA** cria uma tarefa
com as **duas** datas na mesma linha:

- a **entrega**, na data sugerida — que e quando o escritorio trabalha;
- o **prazo fatal**, no fim do dia do fatal — que e o que o Inicio e o resumo
  do dia vigiam.

A tarefa fica com o responsavel escolhido, ou com quem aceitou. Sugestao de
**AGENDAMENTO** (audiencia, pericia) vira compromisso na Agenda. Ver
`docs/AGENDA.md`, "Agenda nao e Tarefas".

## A sugestao aparece como sugestao

O bloco da sugestao tem cor propria (violeta), diferente do texto da
publicacao e dos botoes do escritorio, com a etiqueta **Sugestao da IA** e o
aviso "precisa de conferencia: confira o prazo e o assunto nos autos antes de
lancar". O botao diz o que vai acontecer: "Conferi — criar tarefa" ou
"Conferi — lancar na agenda".

Tres dias **uteis**, e nao corridos: tres dias corridos antes de uma quarta cai
no domingo, e trabalho marcado para domingo e trabalho que ninguem ve. E a
data sugerida **nunca cai no passado**: publicacao lida com atraso, cujo fatal
e daqui a dois dias, sugere hoje — nao anteontem.

## A linha que nao se cruza

```
a IA diz QUANTOS DIAS o texto menciona
o SISTEMA diz QUE DIA isso e
```

Nunca o contrario. O prompt proibe o modelo de calcular data, e o esquema da
resposta so tem campo para o numero de dias. Quem transforma dias em data e
`src/lib/prazos.ts`, com CPC 219 (dias uteis), CPC 224 (exclui o comeco,
inclui o vencimento), CPC 220 (recesso) e o calendario de feriados do proprio
escritorio.

**Por que tanto cuidado:** prazo errado e a unica coisa neste sistema cujo erro
nao tem conserto depois. E um modelo de linguagem contando dia util com
feriado municipal no meio e exatamente o tipo de conta que parece certa e nao
e. No teste, 15 dias uteis a partir de 03/11/2026 vencem em 25/11, e tres dias
uteis antes disso e **19/11** — e nao 20, porque 20/11 e feriado nacional da
Consciencia Negra. Quem fizesse a conta de cabeca marcaria a peca para um dia
em que o forum esta fechado.

Materia penal conta em dias **corridos** (CPP 798), e o sistema distingue: sem
isso, um prazo de cinco dias em acao penal sairia uma semana depois do que
vence de verdade.

## Quando a IA nao responde

Chave ausente, modelo fora do ar, resposta fora do formato, recusa do
classificador de seguranca: **nenhum desses deixa a publicacao sem sugestao.**
Cai para a classificacao por palavra-chave, com `confianca: BAIXA` — que e o
aviso, na tela, de que aquilo saiu de palavra e nao de leitura.

A alternativa seria a lista sem sugestao, que e a lista de antes. E e dela que
o prazo escapa.

## O compromisso nasce no clique

A triagem **sugere**; o compromisso so existe depois que uma pessoa aceita.
Sistema que cria prazo sozinho na agenda do escritorio e sistema em que
ninguem confia na agenda — e agenda em que ninguem confia nao e olhada no dia
em que importa.

Na tela da publicacao da para mudar a data, o titulo e o responsavel antes de
lancar, ou recusar a sugestao de uma vez.

## A tela

O texto da publicacao e o que importa nesta tela, e tem tratamento de texto
para ler: fundo proprio, entrelinha solta, largura inteira do cartao. Fechado
mostra seis linhas — o bastante para saber do que se trata; **o cartao inteiro
abre no clique**, porque um botao escondido entre outros cinco e um botao que
ninguem acha.

## Quando roda

**Junto com a captura**, dentro do mesmo trabalho: a publicacao que chega as
3h esta na tela com a sugestao quando o escritorio abre. Nao ha botao de "ler
com IA", e nao ha um segundo passo — leitura que depende de alguem clicar e
leitura que nao acontece nos dias cheios, que sao justamente os dias em que o
prazo escapa.

`TRIAR_PUBLICACOES` continua no `cron-noturno` como rede: pega o que a captura
nao pegou. E a publicacao que esta na tela sem leitura — a que entrou antes de
a triagem existir — **le a si mesma** quando alguem abre a tela, uma vez, em
chamadas escalonadas para que vinte publicacoes nao virem vinte chamadas no
mesmo segundo.

> A analise avulsa (`ANALISE_PUBLICACAO`) foi removida. Era um resumo bonito
> que ninguem transformava em prazo, e dependia de alguem lembrar de pedir. A
> triagem substitui: devolve menos texto e algo que vira compromisso com um
> clique.

E idempotente: uma triagem por publicacao (indice unico), refazer substitui a
sugestao, e sugestao ja **aceita** nunca e mexida — o compromisso ja existe, e
mudar a sugestao por baixo dele so confundiria quem olhasse depois.

## Processos cadastrados pelo DJEN

Quando o escritorio cadastra uma **OAB**, o sistema busca no DJEN os
**ultimos 12 meses** daquela OAB (de 30 em 30 dias, um pedido por vez) e
**cadastra cada processo encontrado** (`IMPORTAR_PROCESSOS`,
`src/lib/processos-do-djen.ts`). Depois disso, em toda captura diaria,
processo novo que aparece numa publicacao ja entra cadastrado e a publicacao
nasce ligada a ele. A busca do ano nao enche a lista de publicacoes: so
cadastra processos.

- **Cliente**: vem das partes intimadas. Se o nome de uma parte bate com **um
  unico** cliente, o processo nasce ligado a ele (igualdade, ou nome contido
  quando o mais curto tem 3+ palavras significativas — "Jose da Silva" nao
  vira "Jose da Silva Santos"). Sem cliente, o processo guarda as partes e
  **liga sozinho quando o cliente for cadastrado**.
- **Segredo de justica nao e cadastrado sozinho** (texto fala em segredo ou
  sigilo, ou as partes vem em iniciais/mascaradas). A publicacao mostra
  "segredo de justica — cadastre o processo a mao" e o botao **Cadastrar
  processo**, com a escolha do cliente. O mesmo botao aparece em qualquer
  publicacao cujo processo ainda nao esta cadastrado.
- Em OABs monitoradas, cada OAB mostra quando os processos foram buscados.

### O que o DJEN ensinou (sistema da Advocacia Roma)

`src/lib/djen.ts` traz as licoes de quem usa o DJEN em producao:
1. o filtro por OAB da API devolve comunicacao de **outro** advogado (numero
   de OAB repetido em outra UF) — toda comunicacao e reconferida pelo numero
   **e** UF dos advogados intimados, e a que nao bate fica de fora. E o que
   impede cadastrar processo que nao e do escritorio;
2. no maximo **50 itens por pagina** (acima disso a API devolve vazio sem
   erro);
3. pausa entre paginas (limite de taxa; `DJEN_PAUSA_MS`);
4. `datadisponibilizacao` em DD/MM/AAAA;
5. texto em HTML cru e limpo (`limpar-html.ts`).

### A aba Processos como base

Os processos entram **so pelas OABs dos advogados do escritorio**: todo
advogado incluido com OAB (na implantacao ou pela tela Equipe) passa a ser
monitorado, e os processos dele dos ultimos 12 meses sao importados. Cada
processo guarda, do DJEN:

- **partes** (com o polo ativo/passivo);
- **ultimo andamento**: data, tipo e texto da comunicacao mais recente — a
  busca do ano e as capturas diarias so movem o andamento para a frente;
- classe processual, tribunal e vara.

A aba **Processos** mostra tudo isso, ordenada pelo andamento mais recente,
com o filtro **Sem cliente**. Em processo sem cliente, cada parte tem
**tornar cliente**: o cliente e criado com o nome (ou reaproveitado, se ja
existe), o processo passa a ser dele, e os outros processos em que ele
aparece tambem. E assim que a base de clientes nasce dos processos que o
escritorio ja tem; o resto do cadastro completa-se na ficha (ou lendo o
documento pela IA).
