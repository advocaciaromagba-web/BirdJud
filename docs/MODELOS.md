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

O texto base veio de contrato, procuracao e declaracao REAIS de escritorio — a
estrutura, as clausulas e a redacao de uso corrente. **Nenhum dado veio junto:**
nome de cliente, CPF, CNPJ, OAB, valor e objeto da acao sairam todos, e no lugar
deles ficaram os campos que o sistema preenche com os dados de CADA escritorio.

**Nao e a peca pronta de ninguem.** E o ponto de partida, para um escritorio
novo conseguir emitir no primeiro dia. Antes de usar como esta, o advogado
responsavel le e adapta: a redacao e a responsabilidade sao do escritorio, e a
tela diz isso.

### Uma correcao que o modelo de origem precisava

O modelo real dizia que o contrato e titulo executivo extrajudicial "nos termos
do artigo 585, inciso II, do Codigo de Processo Civil". Esse artigo e do **CPC
de 1973, revogado**. No CPC de 2015 o dispositivo e o **artigo 784, inciso
III** — "o documento particular assinado pelo devedor e por 2 (duas)
testemunhas" —, que e exatamente por que o contrato pede duas testemunhas no
pe. O modelo do sistema cita o artigo vigente.

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

## Quem assina a peca

Em banca de um ou dois advogados a resposta e sempre "todos", e a tela nem
mostra a escolha. Com mais de um, aparecem caixas de marcar: **sem marcar
ninguem, saem todos**.

Marcar importa no escritorio maior. Uma procuracao outorgando poderes a dez
advogados quando dois vao atuar da poder a mais gente do que o cliente quis — e
a procuracao e o documento em que isso custa mais caro, porque qualquer um dos
outorgados pode transigir, receber e dar quitacao.

A escolha fica guardada **no cliente**: ha cliente que e so de uma das
sociedades, e perguntar de novo a cada peca seria pedir que alguem errasse uma
vez. Vazio continua significando todos, entao nenhum cliente ja cadastrado
mudou de ideia quando o recurso entrou.

Escolha que nao casa com ninguem — advogado desligado, por exemplo — **cai no
padrao, que e todos**. Uma procuracao sem outorgado nao e um documento
incompleto: e um documento que nao serve para nada.

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

## Em que formato sai, e a conferencia antes de sair

Na tela de **Gerar documentos** marca-se tambem o formato: **PDF**, **Word
(.docx)**, ou os dois.

| | O que e |
|---|---|
| `.docx` | o arquivo do escritorio, inteiro: timbre, fonte e formatacao como estao no modelo. So o texto dos campos foi mexido. |
| PDF | o MESMO texto, com os mesmos valores, desenhado pelo BirdJud em A4 com as margens do modelo (`src/lib/pdf.ts`). |

**O PDF nao e uma conversao do .docx.** Nao existe Word aqui dentro, e nao
existe LibreOffice no servidor. O PDF e desenhado a partir do mesmo XML ja
preenchido — nao ha um segundo caminho de preenchimento, porque se houvesse, um
dia o .docx e o PDF da mesma peca diriam valores diferentes e ninguem saberia
qual foi assinado.

O que atravessa: o texto, os valores, o negrito, o alinhamento (incluindo
justificado), as quebras de linha e os paragrafos em branco entre as clausulas.
O que **nao** atravessa: imagem — o timbre, quase sempre —, tabela, recuo
especial e a fonte propria do escritorio. Quando o modelo tem imagem, a tela
avisa em amarelo e diz o caminho: baixar o `.docx` e exportar o PDF pelo Word.

A fonte do PDF e a Times padrao, que escreve WinAnsi — todo o portugues cabe.
Caractere de outra tabela, que entra por copiar e colar de outro programa, sai
como `?` **e a tela diz qual foi**: um quadrado preto no meio de uma clausula
nao pode passar calado.

### A conferencia

**Conferir na tela** monta a peca e mostra o PDF ali mesmo, num quadro, antes
de qualquer download. Dali se baixa o PDF, se baixa o Word, se imprime ou se
abre em outra aba. Os avisos aparecem acima do quadro: campo sem valor no
cadastro, campo que o sistema nao conhece, modelo com imagem, caractere
trocado.

A ordem importa: o que a peca tem de errado tem de aparecer enquanto ainda da
para arrumar, nao no papel que o cliente ja assinou. Conferir **nao** grava a
escolha de quem assina — so o download grava, porque so ele e a peca saindo de
verdade.

A CSP precisou de `frame-src 'self' blob:` por causa desse quadro. Nao e
abertura para terceiro: `blob:` so existe dentro da propria origem.

## Mandar para assinatura

Da propria conferencia, pelo **Autentique**, com o plano do escritorio — a
integracao fica em Integracoes e o modulo e o de assinatura eletronica. O botao
so aparece quando as duas coisas existem: mostrar um botao que vai dar erro e
pior que nao mostrar, porque quem clica acha que o sistema falhou.

O que sobe e **o mesmo PDF que esta na tela**, gerado no mesmo caminho do
download. Nao ha uma segunda montagem: se houvesse, um dia o que foi conferido
e o que foi assinado seriam documentos diferentes.

### Quem assina cada peca

Nao e detalhe de tela — e de quem e a assinatura que o documento precisa ter
para valer:

| Peca | Assina | Por que |
|---|---|---|
| Procuracao | so o cliente | e ato do OUTORGANTE; o advogado nao assina a propria procuracao |
| Declaracao de hipossuficiencia | so o cliente | e declaracao dele, sob a responsabilidade dele |
| Recibo | so o escritorio | quem da quitacao e quem recebeu |
| Contrato de honorarios | os dois | e bilateral |

A tela deixa mudar. O padrao e o que esta certo na maioria das vezes, nao uma
regra imposta.

Quem aparece dos dois lados — o advogado que tambem e o contato do cliente —
entra **uma vez so**: o provedor cobra por signatario, e a pessoa receberia dois
e-mails para assinar o mesmo papel.

### Duas coisas que mudam o desenho

1. **Cada envio custa ao escritorio.** O plano do Autentique e dele, cobrado por
   documento. Dois cliques no mesmo botao nao podem virar dois contratos na
   caixa de entrada do cliente — por isso o registro em `EnvioParaAssinatura`
   com indice unico por documento do provedor, e por isso a peca repetida **com
   envio ainda em aberto** para no 409 e pergunta. Nao e proibicao: contrato
   corrigido se manda de novo mesmo, e peca ja assinada ou recusada nem
   pergunta.
2. **O envio e irreversivel** do ponto de vista do cliente: o e-mail sai na
   hora. Por isso tudo que da para conferir e conferido ANTES — signatario sem
   e-mail, e-mail torto, peca com campo em branco — e os impedimentos saem
   TODOS de uma vez, nao um por tentativa.

### O que ainda e so promessa

O caminho foi provado de ponta a ponta contra um **Autentique de mentira** que
fala o mesmo protocolo: o PDF sobe como arquivo (nao dentro do JSON), a lista
de signatarios sai certa por especie, o reenvio para, a consulta atualiza quem
ja assinou. **Nao foi provado contra o Autentique de verdade** — isso depende de
um token de escritorio, e o primeiro envio real e que vai dizer. GraphQL
responde 200 mesmo quando recusa, entao o corpo e lido sempre, e a mensagem do
provedor chega inteira a tela.

Nao ha webhook: a situacao se atualiza quando alguem clica em **conferir**. Um
webhook por escritorio e o passo seguinte.

## Historico

Modelo trocado vira inativo em vez de sumir. A peca que saiu ontem saiu daquele
texto, e um dia alguem vai perguntar qual era. Um indice unico PARCIAL garante
"um ativo por especie" sem impedir varios inativos (ver `28_modelos`).

Quem troca o modelo e so o ADMIN do escritorio. Baixar, qualquer usuario pode.

## Limites conhecidos

- Cabecalho e rodape **sao** preenchidos (`header*.xml`, `footer*.xml`), que e
  onde costuma morar o timbre — e saem assim no `.docx`. O PDF desenha so o
  corpo: um timbre escrito no cabecalho do modelo nao aparece no PDF.
- O PDF nao traz imagem do modelo (timbre), tabela nem fonte propria do
  escritorio — ver acima. Para um PDF identico ao papel da banca: baixar o
  `.docx` e exportar do Word.
- O envio para assinatura nao foi exercitado contra o Autentique de verdade,
  so contra um de mentira que fala o mesmo protocolo — ver acima.
- Sem webhook do provedor: a situacao do documento so muda quando alguem pede
  para conferir.
- Campo dentro de caixa de texto ou de tabela aninhada em desenho pode nao ser
  alcancado, pelo mesmo motivo: fica fora do corpo do documento.
