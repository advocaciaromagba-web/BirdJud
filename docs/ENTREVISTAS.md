# Entrevista de triagem

A primeira conversa com quem procura o escritorio, virando documento.

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

## O que ainda nao existe

- **Audio gravado, enviado como arquivo** (audiencia gravada de longe). Exige
  um servico de transcricao — fornecedor novo, credencial e custo por
  minuto. Decisao em aberto; a costura esta pronta.
- **PDF da entrevista**: a Roma gera um; aqui a geracao de documento ja
  existe em `modelos-do-escritorio.ts` e so falta a especie.
