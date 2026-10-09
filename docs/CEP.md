# Endereco pelo CEP

Em todo cadastro com endereco, o primeiro campo e o CEP. Digitados os 8
digitos, rua, bairro, cidade e UF se preenchem sozinhos e o cursor vai para
o **numero** — e so o que falta.

## Onde vale

| Tela | Campo |
| --- | --- |
| Clientes → Novo cliente | Endereco do cliente (grava junto com o cadastro) |
| Ficha do cliente | Endereco do cliente (edicao) |
| Configuracoes → Administracao → Identidade | Endereco da sede do escritorio |
| Plataforma → Implantacao → Dados do escritorio | Endereco da sede, quando o operador implanta |

O endereco da sede e o que entra na qualificacao do escritorio nas pecas.
Quando a cidade do escritorio esta em branco, ela vem da sede.

## CEP geral de cidade

Cidade pequena costuma ter um CEP so (ex.: 14840-000, Guariba/SP). Nesse
caso so cidade e UF vem preenchidas, o recado avisa "CEP geral" e o cursor
vai para a **rua**.

## Como funciona

- A pagina consulta `GET /api/cep/{cep}` no proprio dominio (a politica de
  seguranca nao deixa a pagina falar com servicos de fora).
- O servidor tenta, em ordem: **ViaCEP**, **BrasilAPI** e **OpenCEP**. O
  primeiro com cidade e UF vence; se ele trouxer CEP geral, os seguintes
  ainda sao consultados para tentar achar a rua.
- Resposta guardada em memoria por 24 horas (ate 5.000 CEPs). "Nao existe"
  so e guardado quando algum servico de fato respondeu — queda de rede nao
  marca CEP valido como inexistente.
- Limite de 120 consultas por hora por origem.
- Se nenhum servico responder, o cadastro continua normal: e so digitar o
  endereco a mao.

## Gravacao

O endereco e gravado com o CEP so em digitos, UF em maiuscula e a rua nas
duas chaves (`logradouro` e `rua`), que e o que os modelos de documento leem.

## Codigo

- `src/lib/cep.ts` — consulta aos tres servicos, leitura e memoria.
- `src/app/api/cep/[cep]/route.ts` — rota usada pelas paginas.
- `src/componentes/consultaDeCep.ts`, `RecadoDoCep.tsx`, `EnderecoComCep.tsx`
  — mascara, consulta, recado e o bloco de endereco reaproveitado.
- `testes/cep.test.ts` — testes (servidor falso via `CEP_VIACEP_URL`,
  `CEP_BRASILAPI_URL`, `CEP_OPENCEP_URL`).
