# Porte do Sistema da Advocacia Roma para o BirdJud

O sistema da Advocacia Roma (`advocaciaromagba-web/sistema-advocacia-roma`) e
um sistema de UM escritorio, com os dados reais daquele escritorio. O BirdJud e
multi-inquilino: cada escritorio que adere tem os proprios dados, as proprias
credenciais e o proprio endereco.

Deste documento sai o que se colhe de la, o que NUNCA se colhe, e em que ordem.

## A regra, e ela nao tem excecao

**De la vem conhecimento. Nunca conteudo.**

| Vem | Nao vem, em hipotese nenhuma |
| --- | --- |
| Como a funcao funciona | Chave de API, token, senha |
| Quais campos a integracao exige | Certificado digital (`.pfx`, `.p12`) |
| Regras de negocio e base legal | CNPJ, CPF, inscricao municipal |
| O que o provedor recusa, e por que | Cliente, processo, lancamento, nota |
| As armadilhas ja descobertas | Arquivo anexado, `.env`, seed, fixture |

**Nenhum arquivo e copiado.** Tudo e reescrito na pilha do BirdJud. Isso nao e
formalidade: funcao de escritorio unico nao sobrevive ao multi-inquilino, pelo
motivo da secao seguinte.

### Varredura feita em 06/10/2026

O repositorio foi varrido antes de qualquer leitura de funcao:

- sem `.env`, sem `.pfx`/`.p12`/`.pem`/`.key`, sem dump, sem planilha;
- nenhuma credencial com formato conhecido (Anthropic, Asaas, Meta, Google,
  AWS, chave privada) no codigo ou no historico;
- no historico so entraram `.env.example` e `.env.producao.exemplo`;
- um CNPJ aparece em `onedrive-organizacao.ts`, dentro de um comentario que
  explica dois formatos do mesmo numero. Nao e credencial e nao vem junto.

Repetir esta varredura a cada nova leitura do repositorio.

## Por que e reimplementacao, nao transplante

No sistema da Advocacia Roma, "o escritorio" e implicito: nenhuma consulta
precisa dize-lo. No BirdJud **toda** consulta carrega `escritorioId` e **toda**
tabela tem RLS forcado. Uma funcao copiada sem isso quebra o isolamento — e
quebra em silencio, sem erro, sem teste vermelho, ate o dia em que um
escritorio enxerga o cliente de outro.

O isolamento e a unica garantia do BirdJud que nao pode falhar. Por isso cada
item portado passa por: tabela com `escritorioId` e RLS, consulta por
`comEscritorio`, e teste de isolamento proprio.

## Credenciais: uma por escritorio, com uma excecao decidida

No sistema de origem as credenciais sao daquele escritorio, em variavel de
ambiente. No BirdJud elas vivem na tabela `Integracao`, cifradas por escritorio
(AES-256-GCM), preenchidas pelo proprio escritorio. **O que se colhe da
integracao e o protocolo** — quais endpoints, quais campos, quais recusas —, e
isso se liga ao modelo de credencial que o BirdJud ja tem.

| Integracao | De quem e a credencial |
| --- | --- |
| **WhatsApp** | **DA PLATAFORMA — uma so, para todos os escritorios** |
| Autentique (assinatura) | do escritorio |
| Certificado digital A1 | do escritorio |
| NFS-e | do escritorio |
| Asaas / meio de pagamento | do escritorio |
| E-mail | do escritorio |
| Nuvem (OneDrive, Google) | do escritorio |

### A decisao do WhatsApp, e o que ela custa

Decidido em 06/10/2026: **o WhatsApp e um so, da plataforma**, porque e por ele
que a notificacao sai. Hoje o BirdJud trata WhatsApp como integracao por
escritorio; isso muda.

Quatro consequencias que vem junto, e que precisam ser ditas:

1. **O numero que aparece para o cliente final e o da plataforma**, nao o do
   escritorio. Quem responder a mensagem fala com a plataforma.
2. **Os modelos sao aprovados pela plataforma na Meta**, uma vez, nao por cada
   escritorio. Isso simplifica a adesao e tira do escritorio uma espera que
   costuma levar dias.
3. **O custo por mensagem e da plataforma**, entao ele precisa ser medido por
   escritorio (ja ha `ConsumoMensal` para isso) ou vira prejuizo invisivel.
4. **Perante a LGPD, quem fala com o cliente do escritorio e a plataforma.**
   Isso precisa estar no contrato e nos termos, nao so no codigo.

## O que existe la e nao existe aqui

Medido em 06/10/2026. Origem: 40.056 linhas, 69 modulos, 116 rotas, 31 tabelas,
46 migracoes, **0 testes**. BirdJud: 22.800 linhas, 67 modulos, 41 rotas, 26
tabelas, 573 testes.

O numero de linhas nao mede valor — mede trabalho. O que decide a ordem abaixo
e o que um escritorio nao perdoa perder.

Linha com ✔ ja esta no BirdJud, com teste proprio de isolamento. A ordem
abaixo e a que sobrou.

### Primeiro: o que o escritorio nao perdoa

| O que | O que resolve |
| --- | --- |
| ✔ **Prazos processuais** (`prazos`, `expediente`) | Contagem em dias uteis com feriado forense e suspensao de 20/12 a 20/01, feita em codigo e nunca aceita pronta da IA. Perder prazo perde direito. |
| ✔ **Checklist de documentos** (`checklist-documentos`) | O que pedir ao cliente por tipo de acao: basicos fixos em codigo, especificos sugeridos pela IA. |
| ✔ **Representantes legais** (`representantes`) | Quem assina pela pessoa juridica, o que entra na qualificacao da peca. |

### Depois: dinheiro que entra e sai

| O que | O que resolve |
| --- | --- |
| ✔ **Conciliacao por extrato** (`asaas-extrato`, `lancamento-match`, `monitor-pagamentos`) | Conferir o extrato, nao so o webhook: tarifa, Pix avulso, estorno e saque. O extrato da InfinitePay vem junto com a InfinitePay, abaixo. |
| ✔ **Honorarios e contrato** (`cobrancas-contrato`, parcelas, a vista) | Cobranca que nasce do contrato: plano de parcelas visivel antes de existir cobranca, uma parcela por vez perto do vencimento. |
| ✔ **Contas a pagar** e despesa recorrente | Despesa fixa com vigencia (de quando ate quando), geracao diaria automatica e aviso de vencimento — conta a pagar e recebimento — na mesma regua dos prazos, so para ADMIN. |
| ✔ **Metas** (`AnnualGoal`) | Meta anual contra o realizado, com o RITMO: quanto deveria ter entrado a esta altura do ano, quanto falta por mes e onde o ano fecha se nada mudar. |
| **InfinitePay** | Segundo meio de pagamento, a escolha do escritorio. |

### Depois: a rotina do dia

| O que | O que resolve |
| --- | --- |
| **Resumo diario** (`resumo-diario`) | O que vence hoje, chegou hoje, precisa de alguem. |
| **Participantes** em evento e tarefa | Compromisso com mais de uma pessoa. |
| **Lembretes e auto-resposta de WhatsApp** | Confirmacao de audiencia sem alguem lembrar de mandar. |
| **Duplicados** (`clientes-duplicados`, `publicacoes-duplicadas`) | Cadastro repetido e publicacao repetida. |
| **Permissoes por area** (`permissoes`, `area-auth`, `areas`) | O BirdJud tem tres papeis; la ha permissao por area. |

### Depois: captacao e IA

| O que | O que resolve |
| --- | --- |
| **Entrevista guiada** (`perguntas-entrevista`, `entrevista-analise`, `entrevista-pdf`) | Primeira conversa com o cliente, virando documento. |
| **Transcricao de audio** (`transcricao-audio`) | Audiencia e reuniao viram texto. |
| **Revisao e minuta** (`revisao-ia`, `minuta-prompt`, `claude-documentos`) | O BirdJud tem minuta; la esta mais trabalhado. |
| **Leitura de audiencia** (`leitura-audiencia`) | Intimacao vira compromisso. |

### Depois: arquivos e nuvem

| O que | O que resolve |
| --- | --- |
| **OneDrive / Microsoft Graph** (`onedrive`, `onedrive-organizacao`, `onedrive-padronizacao`) | Pasta do escritorio organizada e padronizada sozinha. |
| **AASP** (`aasp`) | Outra fonte de publicacao, alem do DJEN. |
| **Manual em PDF** (`manual-pdf`) | O escritorio aprende sozinho. |

### NFS-e: o que ja existe aqui, mas la esta mais pronto

`EmissorNfse`, assinatura do advogado na nota, regime futuro, IBS/CBS. O
BirdJud tem o modulo; falta o que a reforma tributaria exige.

## Como cada item e entregue

1. Leio a funcao na origem e escrevo o que ela faz — regra, nao codigo.
2. Reimplemento no BirdJud: tabela com `escritorioId` e RLS, consulta por
   `comEscritorio`, credencial por escritorio quando houver.
3. Teste proprio, incluindo isolamento.
4. Conferido rodando, nao so compilando.
5. Um item por entrega. Nada de "portei tudo".

Nenhum arquivo da origem entra neste repositorio. Nenhum dado da Advocacia Roma
entra neste repositorio.
