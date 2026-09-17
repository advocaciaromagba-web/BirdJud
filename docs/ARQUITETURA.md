# Arquitetura do BirdJud

## Regra de independencia

O BirdJud e um produto autonomo. Nao compartilha banco, repositorio, credencial,
conta de integracao, fila ou webhook com nenhum outro sistema. O unico
reaproveitamento permitido e de **arquitetura**: modelagem, padroes de codigo e
desenho das rotinas, reescritos aqui.

Consequencias praticas:

- nenhum `.env`, certificado, token ou modelo de mensagem vem de fora;
- banco proprio e vazio, em projeto de infraestrutura separado;
- nenhuma rotina deste produto e acionada por outro sistema, nem o contrario;
- um escritorio que ja use outro sistema entra como cliente novo, pela
  importacao de planilha — nenhum banco e conectado, copiado ou espelhado.

## Isolamento — duas travas independentes

**Trava 1, no codigo** (`src/lib/prisma.ts`): a extensao do Prisma injeta
`escritorioId` em toda leitura e escrita, a partir do contexto
(`src/lib/contexto.ts`). Consulta sem escritorio no contexto lanca erro.

**Trava 2, no banco** (`prisma/rls.sql`): Row Level Security no PostgreSQL. Cada
consulta roda dentro de uma transacao que define `app.escritorio_id`; a politica
so devolve linhas daquele escritorio.

Detalhes que derrubam o RLS se esquecidos:

- o usuario da aplicacao **nao pode** ser dono das tabelas nem superusuario —
  por isso tambem usamos `FORCE ROW LEVEL SECURITY`;
- `set_config` precisa estar na **mesma transacao** da consulta, por causa do
  pool de conexoes — e o que `comEscritorio()` garante;
- migracoes rodam com outro usuario (`DATABASE_URL_MIGRACAO`).

## Os tres papeis de banco

| Papel | Para que serve | RLS |
| --- | --- | --- |
| `birdjud_owner` | migracoes e `prisma/rls.sql` | sujeito (`FORCE`) |
| `birdjud_app` | a aplicacao (`prisma`, `prismaSemEscritorio`) | sujeito |
| `birdjud_plataforma` | `prismaPlataforma()`: cadastro de escritorio, painel do operador, rotinas | **atravessa** (`BYPASSRLS`) |

O plano de controle precisa de um papel que atravesse o RLS porque cadastrar um
escritorio acontece quando ainda nao ha escritorio no contexto. Ele e o unico
caminho privilegiado do sistema: nunca deve ser chamado a partir de uma rota de
escritorio, e todo acesso de suporte a dados de um escritorio passa por
`AcessoSuporte`.

## A view EscritorioPublico

A tela de login precisa resolver `<slug>.birdjud.com.br` antes de haver sessao.
A view expoe **so** colunas de marca e nenhuma de negocio.

Detalhe que custou um teste vermelho: a view precisa **pertencer a
`birdjud_plataforma`**. Uma view roda com os privilegios do dono
(`security_invoker = false`, o padrao) e `birdjud_owner` tambem esta sob
`FORCE ROW LEVEL SECURITY` — se a view fosse dele, devolveria zero linhas e a
tela de login ficaria sem marca. Como ela atravessa o RLS, nao acrescentar
nenhuma coluna de negocio a ela.

## Modulos

`src/lib/modulos.ts` e o ponto unico. Menu, rotas e rotinas consultam so
`moduloAtivo()` / `exigirModulo()`. Modulo nao contratado some do menu, faz a
rota responder 403 e a rotina nem roda para aquele escritorio.

## Credenciais

Nunca em variavel de ambiente. Cada escritorio cadastra as suas; elas sao
cifradas em AES-256-GCM (`src/lib/segredo.ts`) e guardadas em `Integracao`.
`obterIntegracao(escritorioId, tipo)` e o unico caminho de leitura.

## Bateria de isolamento

`testes/isolamento.test.ts` cria dois escritorios e tenta ler, alterar e apagar
dados do outro — 10 casos, incluindo dois que driblam a trava 1 de proposito
para provar que o RLS sozinho ja barra. Roda no CI a cada push e antes de todo
deploy. Nenhuma rota entra no sistema sem estar coberta por ela.

## Autenticacao e sessao (fase 1)

O endereco decide o escritorio, sempre no servidor:

1. `src/middleware.ts` (runtime edge, sem Prisma) le o `Host`, extrai o slug e
   o poe no cabecalho `x-escritorio-slug`. O cabecalho e **apagado antes** de
   ser reescrito: nada vindo de fora e aproveitado.
2. `src/lib/sessao.ts` traduz o slug em escritorio pela view `EscritorioPublico`.
3. `authorize()` em `src/lib/auth.ts` faz a mesma resolucao pelo `Host` da
   requisicao. Nada do corpo do POST participa: se o escritorio viesse de la,
   bastaria forjar o id de outro escritorio ou um status diferente do real.

`exigirSessao()` recusa quando:

- o endereco nao corresponde a escritorio nenhum;
- o escritorio esta `SUSPENSO` ou `ENCERRADO` (`INADIMPLENTE` ainda entra —
  cobranca nao e bloqueio imediato);
- nao ha sessao;
- **a sessao e de outro escritorio** — cookie de A no subdominio de B nao vale.

Essa ultima e a que sustenta o modelo. Ha duas camadas: o cookie do NextAuth e
host-only, entao o navegador nem envia para outro subdominio; e, se for enviado
a mao, a guarda recusa.

Senha e bcrypt com custo 12; cinco erros bloqueiam o usuario por 15 minutos; o
segundo fator e TOTP e o QR Code sai com o nome do **escritorio**, nao da
plataforma. A tela de login devolve sempre a mesma mensagem, para nao revelar
se o e-mail existe, se a senha esta errada ou se a conta esta bloqueada.

## Duas camadas de permissao

| Camada | Pergunta | Onde |
| --- | --- | --- |
| Modulo contratado | o **escritorio** paga por esta area? | `src/lib/modulos.ts` |
| Papel do usuario | esta **pessoa** pode fazer isto? | `src/lib/papeis.ts` |

As duas precisam permitir. `exigirSessao(modulo?)` cobre a primeira;
`exigirAdmin(modulo?)` cobre as duas. O menu segue a mesma regra: area que a
pessoa nao pode abrir nao aparece.

## Conta do usuario

- **Troca de senha**: exige a senha atual. A sessao e JWT com validade de 12h,
  entao uma sessao ja aberta continua valendo ate expirar — trocar a senha
  impede logins novos, nao derruba os antigos. Revogacao imediata depende de
  guardar sessao no banco; fica para quando houver necessidade real.
- **Segundo fator**: `/api/conta/dois-fatores/preparar` gera o segredo e o QR
  Code, mas **nao grava nada**. O segredo so vai para o banco quando o usuario
  confirma com um codigo valido — assim ninguem fica travado com um segundo
  fator que nao conseguiu cadastrar. Desligar exige senha **e** codigo.
- O QR Code sai com o nome do escritorio como emissor, nunca "BirdJud".

## Referencias entre registros

Toda rota que recebe o id de outro registro (`clienteId` em um processo,
`processoId` em um compromisso) confere antes de usar que ele existe **neste**
escritorio. A extensao do Prisma ja filtra a leitura, entao um id de outro
escritorio simplesmente nao aparece e a rota responde 400 — e nao cria um
vinculo entre escritorios diferentes.
