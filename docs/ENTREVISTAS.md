# Entrevistas

A conversa com o cliente — ou com a testemunha — virando documento.

> **Atualizado em 14/10/2026.** O que mudou desde o porte, em resumo (detalhes
> nas secoes "Tipos de entrevista", "Gravar e transcrever pela OpenAI",
> "Perguntas pela procuracao" e "Na pasta do cliente", no fim):
>
> - tres tipos: triagem, oitiva de testemunha e coleta de informacoes;
> - a gravacao na tela e transcrita pela OpenAI **na hora**, em trechos de um
>   minuto; o reconhecimento do navegador virou alternativa;
> - perguntas geradas **lendo a procuracao**, e o PDF delas para o cliente
>   responder gravando em casa (tambem pelo WhatsApp);
> - a entrevista nasce **ligada ao cliente**, e a gravacao, o audio importado
>   e o PDF da transcricao vao para a pasta dele;
> - excluir a entrevista de vez, com confirmacao.
>
> As secoes "Por que a entrevista nasce sem cliente" e "Transcricao ao vivo:
> LOCAL OU NADA" descrevem a decisao ORIGINAL e ficam como historico.

Portada do sistema da Advocacia Roma em 08/10/2026. O que se trouxe foi a
FUNCAO e as REGRAS DO PROMPT — nenhum dado, nenhum codigo. La a chamada e um
`fetch` cru com ferramenta forcada; aqui ela passa pelo cliente da
plataforma, com saida estruturada validada pelo servidor, recusa tratada e
consumo medido por escritorio.

## Os tres momentos

A tela segue a ordem da conversa, e nao a ordem do banco:

| Antes | Durante | Depois |
| --- | --- | --- |
| **Roteiro** de ate 15 perguntas, sugerido a partir do assunto | **Anotacao** do que foi dito | **Organizacao** em fatos, documentos, testemunhas e pontos a verificar |

A anotacao fica SEMPRE visivel ao lado da organizacao, nunca escondida atras
dela. A organizacao e apoio e pode estar errada; sem o texto original
ninguem consegue conferir.

## Por que a entrevista nasce sem cliente

`clienteId` e nulo ate alguem ligar. Quem chega para uma consulta pode nao
contratar, e exigir cadastro antes encheria a base de gente que nunca
voltou. Quando o caso e aceito, a entrevista e ligada ao cliente —
`ON DELETE SET NULL`, para que apagar o cliente nao leve junto o registro da
conversa que o escritorio teve.

## O que a IA tem proibido dizer

As cinco regras de `SISTEMA_ANALISE_ENTREVISTA`, cada uma vinda de uma forma
conhecida de a triagem dar errado. Todas travadas por teste em
`testes/ia.test.ts`:

1. **Nao completar.** O modelo sabe como casos parecidos terminam e
   preencheria o que faltou com o que e comum. Numa triagem isso vira fato
   que ninguem disse, dentro de um documento que vai para a pasta. O que
   ficou vago vai para "perguntas em aberto".
2. **A transcricao erra.** Vindo de audio, nome, valor e data chegam
   errados. Dado importante e duvidoso vira pedido de confirmacao.
3. **Prescricao nunca se afirma.** Dizer "ja prescreveu" faz o escritorio
   recusar caso bom; dizer "nao prescreveu" faz perder prazo. Vira ponto a
   verificar, sempre.
4. **Sem artigo de lei.** Enquadramento e do advogado; citacao errada em
   documento de pasta vale menos que nenhuma.
5. **Lista vazia e resposta valida.** Inventar testemunha ou documento para
   nao deixar campo em branco e o pior erro possivel aqui.

## Quando a IA nao esta disponivel

O roteiro NUNCA falta. Sem o modulo de IA, sem chave ou com recusa do
classificador, entra o `ROTEIRO_BASICO` de sete perguntas — pior que um
roteiro sugerido, muito melhor que nenhum. Entrevista e conversa marcada:
nao da para adiar porque um servico de terceiro caiu.

A organizacao, essa, exige o modulo: aqui nao ha substituto honesto.

## As travas que evitam gasto e engano

- **Anotacao com menos de 200 caracteres nao vira chamada paga.** Com tres
  linhas a IA preencheria o vazio inventando, que e o que a regra 1 proibe.
- **Reescrever a anotacao APAGA a analise.** Uma analise que descreve um
  texto que nao existe mais e pior que nenhuma, porque parece conferida.
- **Pedir o roteiro de novo substitui.** Quem clica duas vezes quer outra
  sugestao, nao duas listas.
- **Urgencia fora da lista vira MEDIA**, em vez de ir crua para a coluna.

## Isolamento

`Entrevista` entra na trava 2 (RLS com FORCE) como as demais — 37 tabelas.
O teste em `testes/isolamento.test.ts` nao e burocracia: a entrevista
carrega o relato cru de quem procurou o escritorio, antes de contrato e
antes de procuracao, junto do telefone e da leitura que a IA fez do caso
(documentos que faltam, testemunhas, pontos fracos). Entregar isso ao
escritorio ao lado nao e indiscricao — e dar a peca do adversario antes de
o processo existir. O teste confere que nem a CONTAGEM vaza.

## Transcricao ao vivo: LOCAL OU NADA

O gravador escreve no MESMO campo que se digita, entao o que ele transcreve
e corrigivel na hora, sem copiar nada.

A regra de sigilo esta no codigo, nao so no comentario. **Por padrao o
reconhecimento de voz do Chrome manda o audio para um servidor.** O modo no
dispositivo existe desde o Chrome 139 (ago/2025), mas exige instalar o
idioma e nao esta em todo navegador. Numa triagem o que se fala e materia de
sigilo profissional, entao:

- o componente so liga o reconhecimento quando `available({processLocally:
  true})` responde que o modelo local esta pronto;
- quando falta o idioma, oferece baixar — uma vez, e depois funciona offline;
- quando o navegador nao suporta, **para por ai**. Nao existe botao de
  "transcrever pela nuvem": o aviso explica que isso significaria a conversa
  do cliente sair do escritorio, e a alternativa oferecida e digitar.

O sistema da Advocacia Roma passou por esse caminho antes e registrou a
licao: a transcricao por navegador "dependia de versao do Chrome, pacote de
idioma instalado, permissao e dispositivo de entrada — pontos de falha
demais". Eles resolveram contratando a OpenAI para o audio enviado. Aqui a
escolha foi outra: nao acrescentar fornecedor sem decisao expressa, e nao
degradar o sigilo em silencio quando o local falta.

### O que o modulo puro resolve

`src/lib/transcricao.ts` cuida do que o reconhecimento faz de errado:

| Problema | O que o modulo faz |
| --- | --- |
| trecho vem sem maiuscula nem ponto | poe os dois, senao vira um paragrafo de dez minutos |
| repete o ultimo trecho na pausa | nao entra duas vezes |
| nao sabe quem falou | troca de lado comeca linha nova, com a marca |

E o aviso de silencio depois de 12 segundos: o erro mais caro nao e
transcrever mal, e o microfone errado selecionado e vinte minutos de
conversa que nao viraram nada.

## Audio gravado: OpenAI, centralizada na plataforma

Para audiencia e reuniao JA GRAVADAS, o arquivo vai para a transcricao da
OpenAI. Decisao tomada em 08/10/2026.

**A chave e da plataforma**, uma so para todos os escritorios — igual a da
IA e ao numero de WhatsApp. **O custo e absorvido pelo BirdJud e nao se
repassa.** A medicao em `TRANSCRICAO_MIN` existe para a plataforma saber
quanto gasta.

> A metrica **nao tem modulo** em `MODULO_DA_METRICA`, e isso e deliberado.
> Mapea-la ao modulo `IA` faria `consumoDoMes` aplicar a franquia dele — que
> e em MILHARES DE TOKENS — a MINUTOS de audio, e o escritorio receberia
> cobranca de um excedente nascido de comparar grandezas diferentes. Sem
> modulo: franquia nula, excedente zero.

### O aviso de sigilo e parte do recurso

O audio sai do escritorio com a voz de quem falou. A tela diz isso ANTES do
envio, e exige marcar que entendeu — ninguem descobre depois, numa pagina de
documentacao. E a mesma natureza de exposicao de mandar o texto para a IA
organizar, mas e um passo a mais, e e audio.

Quando os dois caminhos servem, **prefira o local**: a transcricao ao vivo
nao manda nada para fora.

### O que a tela garante

| Situacao | O que acontece |
| --- | --- |
| arquivo acima de 25 MB, vazio ou de formato errado | recusado antes de sair da maquina — a plataforma paga a chamada |
| chave da plataforma recusada | mensagem que nao culpa o escritorio, que nao tem chave nenhuma, e oferece a transcricao ao vivo |
| transcricao volta vazia | falha explicita ("o audio pode estar mudo"), nunca sucesso silencioso |
| ja havia anotacao | o texto do audio e **acrescentado**, nunca substitui |

Acrescentar e nao substituir: quem envia o audio da segunda metade da
reuniao nao quer perder a primeira. Apagar o campo antes e reversivel;
perder o que ja estava escrito, nao.
- **PDF da entrevista**: a Roma gera um; aqui a geracao de documento ja
  existe em `modelos-do-escritorio.ts` e so falta a especie.

## No metodo do sistema da Advocacia Roma

- **Tipo de acao** ao lado de "Sugerir roteiro": orienta as perguntas (fica
  gravado e vai no PDF).
- **Gravador**: modo local (o audio nao sai do computador), download do
  portugues, marcacao de quem fala, aviso de silencio e **Testar microfone**
  com medidor de nivel. Sem modo local, a transcricao por servico externo so
  com **autorizacao expressa** naquela entrevista. A origem (local, nuvem,
  digitada, audio enviado) fica registrada.
- **Anotacoes do advogado** separadas do que foi dito; entram na organizacao
  pela IA e no PDF.
- **Ligar ao cliente**, **Encerrar/Reabrir** (nada e apagado) e **PDF da
  entrevista**: roteiro, organizacao, anotacoes e a transcricao inteira, com a
  origem e o aviso de sigilo profissional.
- **Texto para a peticao inicial** (advogado ou administrador): so depois de
  encerrar e organizar, com o cliente ligado. Monta a qualificacao do
  cadastro e os fatos da organizacao; lacuna vira [PREENCHER] e nada e
  inventado. Cadastro incompleto e listado — completa-se a ficha, ou monta-se
  assim mesmo.

Codigo: `src/lib/entrevista-do-escritorio.ts`, `src/lib/minuta-prompt.ts`,
`src/lib/entrevista-pdf.ts`; migracao 57; testes em
`testes/entrevista-completa.test.ts`.

## Tipos de entrevista

`Entrevista.tipo` (migracao 60): **TRIAGEM** (primeiro atendimento),
**TESTEMUNHA** (oitiva, para entender o caso) e **COLETA** (levantar
informacoes para gerar um documento). Todos gravam, transcrevem, organizam e
geram PDF. Muda por tipo:

| | Triagem | Testemunha | Coleta |
| --- | --- | --- | --- |
| roteiro (`SISTEMA_ROTEIRO*`) | fatos, documentos, pretensao | perguntas ABERTAS e NEUTRAS: o que viu, quando, onde, como conhece as partes | o que o documento precisa: fatos, datas, valores, provas |
| PDF | Entrevista de triagem | Termo de oitiva de testemunha | Entrevista de coleta de informacoes |
| texto da peticao inicial e documentos do cliente | sim | nao | nao |

`processoId` liga a entrevista ao processo (informado pelo numero na
abertura; numero nao cadastrado e erro, nao chute): o roteiro usa a classe,
as partes e o ultimo andamento.

## Gravar e transcrever pela OpenAI

Como no sistema da Advocacia Roma, o audio vira texto pela OpenAI
(`gpt-4o-transcribe`, chave da plataforma). Decisao do escritorio em
13/10/2026, que substitui o "local ou nada" acima.

- **Gravar e transcrever** (`GravadorOpenAI`): o microfone grava em trechos de
  um minuto; cada trecho vai para `/api/entrevistas/[id]/audio` com
  `continua=true`, EM ORDEM (fila), e o texto aparece enquanto a conversa
  acontece. Trecho em silencio nao e erro. Durante a gravacao o campo fica so
  de leitura — o texto e o salvo no servidor.
- **Importar audio** (`EnvioDeAudio`): o arquivo do celular, da audiencia, ou
  o que o cliente gravou em casa respondendo ao PDF das perguntas.
- **Pelo navegador** (`GravadorDeFala`): alternativa recolhida, para quem nao
  quer o audio saindo do escritorio.

Dois defeitos impediam tudo isso em producao ate 13/10/2026, os dois com teste
agora: `Permissions-Policy: microphone=()` bloqueava o microfone em todo o
site (hoje `microphone=(self)`, `testes/cabecalhos.test.ts`), e o pedido de
`verbose_json` ao `gpt-4o-transcribe` era recusado com 400 — so o `whisper-1`
aceita esse formato.

## Perguntas pela procuracao

Na triagem, **"Gerar perguntas lendo a procuracao"** (PDF ou foto): a IA le o
tipo de acao que a procuracao traz ("poderes para propor acao de..."), o
outorgante, e sugere ate 15 perguntas objetivas para a triagem completa
(`SISTEMA_ROTEIRO_PROCURACAO`, `roteiroDaProcuracao`). O tipo de acao fica
gravado. Procuracao so ad judicia, sem a acao: a resposta diz isso e as
perguntas saem pelo assunto. A procuracao e lida e descartada.

As perguntas sao escritas para o CLIENTE, em "voce", porque podem ir por
escrito: **"PDF das perguntas para o cliente"** traz o passo a passo de
gravar em casa (dizer o numero da pergunta antes de responder) e o telefone
do escritorio; **"Enviar pelo WhatsApp"** manda o PDF ao telefone do cliente
ligado, ou ao informado na entrevista. O audio que volta entra por
"Importar audio" e e transcrito.

## Na pasta do cliente

A nova entrevista escolhe o **cliente** (na triagem, e quem e ouvido; nas
outras, o dono do caso; conferido dentro do escritorio). Com cliente ligado,
vao para a pasta dele — e para a nuvem, se conectada:

- a **gravacao feita na tela**, inteira, num arquivo so (um segundo gravador
  roda em paralelo aos trechos; `/api/entrevistas/[id]/gravacao`);
- o **audio importado**;
- o **PDF da transcricao**, ao encerrar.

Sem cliente ligado, nada vai para pasta nenhuma e o cartao avisa. Falha ao
guardar (acima de 25 MB, espaco esgotado) nao apaga a transcricao: a tela diz
o motivo.

## Excluir

"Excluir entrevista" apaga de vez — transcricao, anotacoes, organizacao —
com confirmacao. De vez, e nao arquivada: e conversa sigilosa. O que ja foi
para a pasta do cliente fica la.
