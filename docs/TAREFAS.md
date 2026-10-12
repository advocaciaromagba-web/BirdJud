# Tarefas e metas

Tarefa do dia a dia da equipe, e meta que atravessa o mes.

## Tarefa e trabalho; Agenda e presenca

Tarefa e tudo que alguem precisa **escrever ou providenciar**: montar a
inicial, manifestar, contestar, recorrer, juntar documento. Audiencia,
pericia e atendimento vao na **Agenda** — a API recusa (`src/lib/natureza.ts`,
ver `docs/AGENDA.md`).

Cada tarefa tem duas datas:

| | `vencimento` (Entrega) | `prazoFatal` |
| --- | --- | --- |
| o que e | quando o escritorio entrega o trabalho, com hora | o fatal do processo, quando ha |
| de onde vem | combinada, ou sugerida tres dias uteis antes do fatal | conta com termo inicial, dias e calendario forense (`prazos.ts`) |
| se errar | alguem cobra de novo | perde direito, sem conserto |

O fatal e gravado as 23h59 de Brasilia do dia. A tela de Prazos saiu: os
prazos antigos viraram tarefas, e o Inicio ("tarefas com prazo hoje, a tres
dias uteis ou ja vencidas") e o resumo do dia contam pelo fatal, ou pela
entrega quando nao ha fatal. Meta nao conta.

## Avisos

Quem recebe a tarefa e avisado por e-mail e WhatsApp (modelo
`TAREFA_DESIGNADA`), menos quando se designou a si mesmo. Vinte e quatro
horas antes da entrega e do prazo fatal sai um lembrete (`LEMBRETE_TAREFA`),
so para o responsavel.

## Criar tarefa lendo o documento

Com o modulo IA, "Nova tarefa" abre o leitor (perfil `TAREFA`): intimacao,
despacho ou decisao. A IA le **o que fazer**, o resumo, o processo, a data da
intimacao e **quantos dias**; quem transforma isso em data e o sistema
(`calcularPrazoDaLeitura`), com dia util e o calendario do escritorio — a
mesma conta da triagem de publicacoes. Prazo fatal que a IA tente devolver e
descartado. O formulario chega preenchido, marcado como **Sugestao da IA**, e
so grava depois que alguem confere e clica em salvar.

`meta` separa, dentro da mesma tabela, a tarefa do dia a dia da meta da
equipe: sao a mesma coisa com horizonte diferente, e duas tabelas fariam
toda consulta virar duas.

## A ordem da lista nao segue a prioridade

Esta e a regra que mais importa, e esta travada por teste:

1. **atrasada primeiro**, e dentro dela a mais VELHA no topo — a que esta
   parada ha mais tempo e a que ninguem viu;
2. depois, por data de vencimento;
3. so no empate de data, a prioridade desempata.

Uma tarefa "baixa" que vence hoje e mais urgente que uma "alta" da semana
que vem, por mais que o rotulo diga o contrario. Ordenar pelo rotulo e como
a lista deixa de ser util.

Concluida **nunca** aparece como atrasada, por mais velha que seja.

## Numero do processo

O numero digitado e guardado sempre. Quando bate com um processo cadastrado,
a tarefa se liga a ele; quando nao bate, o numero fica como texto. Perder o
vinculo porque o processo ainda nao foi cadastrado seria pior — alguem
cadastra depois, e editar a tarefa refaz a ligacao.

## Busca

Procura no titulo, na descricao, no nome do cliente e no numero do processo,
sem acento e sem caixa. Todas as palavras do termo precisam aparecer: quem
digita "doctos maria" quer as duas, nao tudo que tem "maria".

E assim porque e assim que a pessoa procura — ela lembra do nome do cliente,
nao do titulo que ela mesma escreveu ha tres semanas.

## O que ainda falta

- **Aviso ao responsavel.** Divida consciente. O `avisarDesignacao` de
  `avisos.ts` recebe um `compromissoId` e resolve canal e destino a partir do
  Compromisso; nao serve para Tarefa sem ser generalizado. Meio-ligar um
  caminho de notificacao e pior que nao ligar: o escritorio passaria a
  confiar num aviso que as vezes sai. Junto com isso vem a regua de 48h /
  24h / vence hoje / atrasada.
- **Quem participa**: varios clientes ou pessoas de fora numa tarefa. O
  padrao ja existe em `ParticipanteDeCompromisso`.
- **Preencher lendo um documento**: despacho ou intimacao vira tarefa com
  providencia, prazo e processo preenchidos. Reaproveita
  `pedirSobreDocumentos` de `ia.ts`, que ja le PDF e foto.
- **Triagem de publicacao criando Tarefa.** Hoje a triagem classificada como
  TAREFA vira Compromisso + Prazo. Com esta tabela existindo, o destino
  natural passa a ser uma Tarefa — mas e mexer em caminho que funciona, e
  fica para quando houver tempo de testar direito.
