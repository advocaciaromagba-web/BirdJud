# Acordo de Tratamento de Dados Pessoais (LGPD)

> Versão 2026-10-20. Revisada por José Luciano da Costa Roma. Anexo ao contrato.

## 1. Papéis

Para os fins da Lei 13.709/2018:

- o **Escritório** é o **controlador**: decide por que e como tratar os dados de
  seus clientes, partes e colaboradores;
- a **Plataforma** é a **operadora**: trata esses dados em nome do Escritório,
  apenas para prestar o serviço e conforme instruções dele.

O contrato de prestação e as configurações feitas pelo Escritório no sistema
são as instruções documentadas do controlador.

## 2. O que é tratado

| Categoria | Exemplos | Origem |
| --- | --- | --- |
| Identificação de clientes | nome, CPF/CNPJ, contatos, endereço | cadastro pelo Escritório |
| Dados processuais | número, tribunal, vara, andamentos, documentos | cadastro e integrações |
| Dados de usuários do Escritório | nome, e-mail, OAB, registro de acesso | cadastro pelo Escritório |
| Dados financeiros | lançamentos, cobranças, notas fiscais | uso dos módulos |

Dados processuais podem conter **dado pessoal sensível** (saúde, convicção,
filiação sindical) conforme a matéria. O tratamento se justifica pelo exercício
regular de direito em processo (art. 11, II, "d").

## 3. Obrigações da Plataforma

- tratar apenas conforme as instruções do Escritório;
- manter o isolamento entre Escritórios;
- exigir sigilo de quem tem acesso;
- registrar todo acesso de suporte;
- adotar as medidas de segurança descritas em `docs/SEGURANCA.md`;
- avisar o Escritório **sem demora injustificada** ao saber de incidente que
  possa acarretar risco ou dano relevante, com o que se sabe até o momento;
- ajudar o Escritório a responder pedidos de titular e de autoridade;
- ao fim do contrato, devolver os dados em formato aberto e apagá-los após o
  prazo de retenção.

## 4. Suboperadores

A Plataforma usa terceiros para infraestrutura e serviços acessórios:

| Suboperador | Para que | Onde |
| --- | --- | --- |
| Railway Corporation | hospedagem da aplicação, banco de dados e arquivos | Amsterdã, Países Baixos (UE) |
| Cloudflare, Inc. | cópia de segurança cifrada | rede da Cloudflare |
| OpenAI, L.L.C. | transcrição de áudio e leitura por inteligência artificial, quando o Escritório usa o módulo | Estados Unidos |
| Anthropic, PBC | leitura de documentos e minutas por inteligência artificial, quando o Escritório usa o módulo | Estados Unidos |
| Meta Platforms, Inc. | envio de mensagens por WhatsApp, quando o Escritório usa o módulo | Estados Unidos |
| Vercel Inc. | retransmissão dos e-mails da Plataforma e consulta ao Diário de Justiça Eletrônico | São Paulo, Brasil |
| Resend, Inc. | envio dos e-mails da Plataforma (acesso, avisos, faturas) | São Paulo, Brasil |
| Google LLC (Gmail) | envio dos e-mails da Plataforma, como reserva | Estados Unidos |

Mudança relevante nesta lista é avisada com antecedência, e o Escritório pode
se opor encerrando o contrato sem ônus.

Serviços conectados pelo próprio Escritório (WhatsApp, Asaas, Autentique,
provedor de e-mail, nuvem de arquivos) são contratados **por ele**, com conta
dele: a Plataforma só usa a credencial que ele cadastrou.

## 5. Direitos do titular

Pedido de titular chega ao Escritório, que é o controlador. A Plataforma
fornece os meios: exportação completa dos dados e exclusão após o encerramento.

## 6. Transferência internacional

Os dados são hospedados em datacenter do Railway em Amsterdã, Países Baixos,
na União Europeia, sujeita ao Regulamento Geral de Proteção de Dados (GDPR).
Há transferência internacional também aos suboperadores nos Estados Unidos
listados acima, apenas para os módulos que o Escritório usar.

As transferências observam o art. 33 da LGPD e são amparadas pelas
cláusulas-padrão contratuais da Resolução CD/ANPD n. 19/2024, além das
salvaguardas de cada provedor. Os dados trafegam cifrados, e as cópias de
segurança são cifradas antes de sair da Plataforma.

## 7. Retenção

Durante o contrato, os dados ficam disponíveis ao Escritório. Encerrado, ficam
por 90 dias para exportação e são apagados em definitivo depois disso,
com registro da purga.

Registros que a Plataforma precisa guardar por obrigação legal própria
(faturamento, por exemplo) são mantidos pelo prazo da lei, em base separada dos
dados do Escritório.

## 8. Encarregado

Encarregado pelo tratamento de dados pessoais da Plataforma: **José Luciano da
Costa Roma**, pelo e-mail contato@blackbirdsolucoes.com.br.
