# Acordo de Tratamento de Dados Pessoais (LGPD)

> Versao 2026-10-16. Revisada por Jose Luciano da Costa Roma. Anexo ao contrato.

## 1. Papeis

Para os fins da Lei 13.709/2018:

- o **Escritorio** e o **controlador**: decide por que e como tratar os dados de
  seus clientes, partes e colaboradores;
- a **Plataforma** e a **operadora**: trata esses dados em nome do Escritorio,
  apenas para prestar o servico e conforme instrucoes dele.

O contrato de prestacao e as configuracoes feitas pelo Escritorio no sistema
sao as instrucoes documentadas do controlador.

## 2. O que e tratado

| Categoria | Exemplos | Origem |
| --- | --- | --- |
| Identificacao de clientes | nome, CPF/CNPJ, contatos, endereco | cadastro pelo Escritorio |
| Dados processuais | numero, tribunal, vara, andamentos, documentos | cadastro e integracoes |
| Dados de usuarios do Escritorio | nome, e-mail, OAB, registro de acesso | cadastro pelo Escritorio |
| Dados financeiros | lancamentos, cobrancas, notas fiscais | uso dos modulos |

Dados processuais podem conter **dado pessoal sensivel** (saude, conviccao,
filiacao sindical) conforme a materia. O tratamento se justifica pelo exercicio
regular de direito em processo (art. 11, II, "d").

## 3. Obrigacoes da Plataforma

- tratar apenas conforme as instrucoes do Escritorio;
- manter o isolamento entre Escritorios;
- exigir sigilo de quem tem acesso;
- registrar todo acesso de suporte;
- adotar as medidas de seguranca descritas em `docs/SEGURANCA.md`;
- avisar o Escritorio **sem demora injustificada** ao saber de incidente que
  possa acarretar risco ou dano relevante, com o que se sabe ate o momento;
- ajudar o Escritorio a responder pedidos de titular e de autoridade;
- ao fim do contrato, devolver os dados em formato aberto e apaga-los apos o
  prazo de retencao.

## 4. Suboperadores

A Plataforma usa terceiros para infraestrutura e servicos acessorios:

| Suboperador | Para que | Onde |
| --- | --- | --- |
| Railway Corporation | hospedagem da aplicacao, banco de dados e arquivos | Amsterda, Paises Baixos (UE) |
| Cloudflare, Inc. | copia de seguranca cifrada | rede da Cloudflare |
| OpenAI, L.L.C. | transcricao de audio e leitura por inteligencia artificial, quando o Escritorio usa o modulo | Estados Unidos |
| Anthropic, PBC | leitura de documentos e minutas por inteligencia artificial, quando o Escritorio usa o modulo | Estados Unidos |
| Meta Platforms, Inc. | envio de mensagens por WhatsApp, quando o Escritorio usa o modulo | Estados Unidos |
| Vercel Inc. | retransmissao dos e-mails da Plataforma e consulta ao Diario de Justica Eletronico | Sao Paulo, Brasil |
| Google LLC (Gmail) | envio dos e-mails da Plataforma (acesso, avisos, faturas) | Estados Unidos |

Mudanca relevante nesta lista e avisada com antecedencia, e o Escritorio pode
se opor encerrando o contrato sem onus.

Servicos conectados pelo proprio Escritorio (WhatsApp, Asaas, Autentique,
provedor de e-mail, nuvem de arquivos) sao contratados **por ele**, com conta
dele: a Plataforma so usa a credencial que ele cadastrou.

## 5. Direitos do titular

Pedido de titular chega ao Escritorio, que e o controlador. A Plataforma
fornece os meios: exportacao completa dos dados e exclusao apos o encerramento.

## 6. Transferencia internacional

Os dados sao hospedados em datacenter do Railway em Amsterda, Paises Baixos,
na Uniao Europeia, sujeita ao Regulamento Geral de Protecao de Dados (GDPR).
Ha transferencia internacional tambem aos suboperadores nos Estados Unidos
listados acima, apenas para os modulos que o Escritorio usar.

As transferencias observam o art. 33 da LGPD e sao amparadas pelas
clausulas-padrao contratuais da Resolucao CD/ANPD n. 19/2024, alem das
salvaguardas de cada provedor. Os dados trafegam cifrados, e as copias de
seguranca sao cifradas antes de sair da Plataforma.

## 7. Retencao

Durante o contrato, os dados ficam disponiveis ao Escritorio. Encerrado, ficam
por 90 dias para exportacao e sao apagados em definitivo depois disso,
com registro da purga.

Registros que a Plataforma precisa guardar por obrigacao legal propria
(faturamento, por exemplo) sao mantidos pelo prazo da lei, em base separada dos
dados do Escritorio.

## 8. Encarregado

Encarregado pelo tratamento de dados pessoais da Plataforma: **Jose Luciano da
Costa Roma**, pelo e-mail contato@blackbirdsolucoes.com.br.
