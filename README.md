# BirdJud

Sistema juridico **white label multi-tenant** para escritorios de advocacia de
ate 50 profissionais. Cada escritorio tem sua marca, seus dados isolados e paga
pelos modulos que contrata e pela faixa de advogados.

> **Produto independente.** O BirdJud nao compartilha banco, repositorio,
> credencial, conta de integracao, fila ou webhook com nenhum outro sistema. O
> unico reaproveitamento e de arquitetura — modelagem, padroes de codigo e
> desenho das rotinas —, reescrita aqui. Ver `docs/ARQUITETURA.md`.

## Stack

Next.js 14 (App Router) · Prisma 5 · PostgreSQL (com Row Level Security) ·
NextAuth · Tailwind · Vitest.

## Estado atual

**Fase 0 concluida e verificada** — base do projeto, schema multi-tenant, as duas
travas de isolamento e a bateria de teste, rodadas contra um PostgreSQL 16 real:
`typecheck` limpo, `build` de producao OK, bateria de isolamento 10/10.

**Fase 1 concluida** — autenticacao por escritorio, subdominio, conta do usuario
(troca de senha e 2FA pela tela), cadastro de usuarios pelo administrador e as
telas de clientes, processos e agenda. 27 testes automatizados, mais um roteiro
de fumaca rodado com a aplicacao no ar.

**Fase 2 concluida** — modulo contratado valendo em menu, rota e rotina; limite
de usuarios por faixa; medicao de consumo com franquia e excedente; e fila de
trabalho no proprio PostgreSQL, com um trabalho em execucao por escritorio.
46 testes automatizados.

**Fase 3 em andamento** — o escritorio conecta e testa as proprias integracoes
pela tela, sem acesso ao servidor: e-mail (SMTP), Asaas, Autentique, WhatsApp
(Cloud API) e certificado e-CNPJ. 70 testes automatizados.

Falta na fase 3: OneDrive e Google Drive por OAuth (dependem do aplicativo
registrado em cada provedor) e o Embedded Signup da Meta com submissao dos
modelos de mensagem — ambos dependem de respostas externas.

Publicacoes sao **so pelo DJEN**: a AASP foi descartada como fonte e nao ha
modulo nem conector para ela.

**Fase 4 concluida** — cadastro de escritorio com periodo de teste, assinatura,
faturas, regua de atraso e suspensao automaticas pela fila, painel do operador
da plataforma com auditoria de acesso, e exportacao completa dos dados.
89 testes automatizados.

Falta na fase 4: cobranca automatica pelo meio de pagamento (o caminho de baixa
ja existe; falta o webhook do provedor chamar `registrarPagamento`) e os precos
de verdade — os da tabela sao provisorios, como o plano exige.

**Modulo de IA** — leitura da publicacao (resumo, prazo indicado, providencia) e
rascunho de manifestacao. As instrucoes proibem inventar fundamentacao e tratam
prazo como indicacao a conferir; a tela rotula tudo como rascunho. Consumo
medido por escritorio em milhares de tokens.

**Modulo de WhatsApp (Cloud API)** — os mesmos avisos, tambem pelo numero do
escritorio, por modelo aprovado na Meta (o unico caminho que a Meta entrega
fora da janela de 24h). Os textos para aprovar estao em
[docs/WHATSAPP.md](docs/WHATSAPP.md).

**Modulo de nuvem (arquivos)** — os documentos do escritorio, com vinculo a
processo ou cliente, cota por MB e exclusao que leva o byte junto. Lista fechada
de tipos, caminho no disco montado so com identificador nosso e download sempre
como anexo.

**Modulo de cobrancas (Asaas)** — o escritorio cobra o cliente dele pela conta
Asaas dele: boleto, Pix ou cartao, com link de pagamento, conferencia do que foi
pago e baixa automatica em receita no financeiro. O dinheiro nao passa pela
plataforma em momento nenhum.

**Modulo de e-mail (avisos)** — resumo diario das publicacoes nao lidas e
lembrete de compromisso 24h antes, enviados pelo SMTP do proprio escritorio.
Cada pessoa escolhe o que recebe em Minha conta.

**Modulo de publicacoes (DJEN)** — captura por OAB monitorada, deduplicacao,
triagem de prazo e urgencia, vinculo automatico com o processo cadastrado e
tela de leitura. A API do CNJ bloqueia acesso de fora do Brasil; quem resolve
isso e o rele da Vercel na regiao gru1 (`rele/`, ver
[docs/RELE-DJEN.md](docs/RELE-DJEN.md)), entao a aplicacao roda em qualquer
regiao. O mapeamento de campos espera conferencia com `npm run conferir-djen`.

**Fase 5 entregue na parte de codigo** — minutas de contrato, termos, acordo de
LGPD, SLA e politica de privacidade; aceite registrado no cadastro com versao,
IP e data; backup e restauracao por escritorio, com a restauracao testada na
bateria automatica; encerramento com prazo de retencao e purga; cabecalhos de
seguranca e limite de taxa no cadastro. 110 testes automatizados.

**Dividas tecnicas fechadas** — revogacao de sessao ao trocar a senha, CSP com
nonce por requisicao (sem `unsafe-inline` em script), limite de taxa no banco
(valido entre instancias) e webhook de pagamento para a baixa automatica das
faturas. 121 testes automatizados.

Falta na fase 5, e nao e trabalho de codigo: **revisao das minutas por
advogado**, definicao de razao social, foro, prazos e valores, backup automatico
agendado na infraestrutura, e o **piloto com 2 ou 3 escritorios** —
roteiro em `docs/SUPORTE.md`.

## Como rodar

```bash
npm install
cp .env.example .env        # preencher; so variaveis da plataforma
npm run migrar              # prisma migrate deploy como dono do banco
npm run rls:aplicar         # aplica prisma/rls.sql (idempotente)
npm run dev
```

Criar um escritorio e o primeiro administrador:

```bash
node scripts/criar-escritorio.mjs alfa "Escritorio Alfa" admin@alfa.adv.br sua-senha-longa
```

Criar um operador da plataforma (acesso ao painel `/plataforma`):

```bash
npm run criar-operador -- "Seu Nome" voce@birdjud.com.br senha-longa
```

Contratar um modulo para um escritorio (tambem da pelo painel do operador):

```bash
node scripts/contratar-modulo.mjs alfa FINANCEIRO
node scripts/contratar-modulo.mjs alfa WHATSAPP 500   # 500 mensagens de franquia
```

A fila precisa de um processo proprio, ao lado do `next start`:

```bash
npm run trabalhador          # consome a fila
npm run espalhar APURAR_CONSUMO     # mede o consumo do mes
npm run espalhar REGUA_DE_COBRANCA  # gera fatura, marca atraso, suspende
npm run espalhar PURGAR_ENCERRADOS  # apaga quem encerrou ha mais que o prazo
npm run espalhar CAPTURAR_PUBLICACOES  # busca no DJEN as OABs monitoradas
npm run espalhar AVISAR             # resumo de publicacoes e lembretes por e-mail
npm run espalhar SINCRONIZAR_COBRANCAS  # confere no Asaas o que foi pago
```

Conferir o mapeamento de campos do DJEN (pelo rele, de qualquer lugar; sem as
duas variaveis, vai direto ao CNJ e so funciona do Brasil):

```bash
DJEN_RELE_URL="https://<projeto>.vercel.app/api/djen" \
DJEN_RELE_TOKEN="<token>" \
npm run conferir-djen -- 123456 SP
```

Backup e restauracao de um escritorio:

```bash
npm run backup -- alfa backup-alfa.json
npm run restaurar -- backup-alfa.json alfa-restaurado   # nasce SUSPENSO
```

Em desenvolvimento, aponte os subdominios no `/etc/hosts`
(`127.0.0.1 alfa.birdjud.test`) e rode com `DOMINIO_PLATAFORMA=birdjud.test`.

Gerar a chave de criptografia das credenciais:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Tres papeis de banco

O RLS so vale se a aplicacao nao for dona das tabelas nem superusuario. Rode
`scripts/preparar-banco.sql` uma vez, como superusuario:

| Papel | Para que serve | Variavel | RLS |
| --- | --- | --- | --- |
| `birdjud_owner` | migracoes e `prisma/rls.sql` | `DATABASE_URL_MIGRACAO` | sujeito (`FORCE`) |
| `birdjud_app` | a aplicacao | `DATABASE_URL` | sujeito |
| `birdjud_plataforma` | cadastro de escritorio, painel do operador, rotinas | `DATABASE_URL_PLATAFORMA` | **atravessa** (`BYPASSRLS`) |

WhatsApp (modelos e conexao): `docs/WHATSAPP.md`. Deploy no Railway: `docs/RAILWAY.md`. Rele do DJEN na Vercel: `docs/RELE-DJEN.md`.

## Testes

```bash
npm run teste              # tudo
npm run teste:isolamento   # bateria de isolamento entre escritorios
```

A bateria de isolamento **roda antes de todo deploy**. Sem `DATABASE_URL` ela e
pulada — em CI, o banco de teste e obrigatorio.

## Mapa do codigo

| Caminho | Papel |
| --- | --- |
| `prisma/schema.prisma` | Schema multi-tenant; toda entidade com `escritorioId` |
| `prisma/rls.sql` | Trava 2: politicas de RLS e view `EscritorioPublico` |
| `src/lib/contexto.ts` | Escritorio da requisicao (AsyncLocalStorage) |
| `src/lib/prisma.ts` | Trava 1: extensao do Prisma + `comEscritorio()` |
| `src/lib/escritorio.ts` | Subdominio, marca e configuracao do escritorio |
| `src/lib/subdominio.ts` | `<slug>.birdjud.com.br` -> slug (edge e servidor) |
| `src/middleware.ts` | Poe o slug no cabecalho; nunca confia no que vem de fora |
| `src/lib/auth.ts` | NextAuth: senha, 2FA, bloqueio; escritorio vem do host |
| `src/lib/sessao.ts` | `exigirSessao()`: sessao + escritorio do endereco + modulo |
| `src/lib/modulos.ts` | Ponto unico de modulo contratado (escritorio) |
| `src/lib/papeis.ts` | Papel do usuario dentro do escritorio |
| `src/lib/ia.ts` | Chamada ao modelo, medicao e recusa |
| `src/lib/prompts-ia.ts` | Instrucoes da IA, para revisao juridica |
| `src/lib/avisos.ts` | Gera e envia os avisos, com idempotencia |
| `src/lib/textos-aviso.ts` | Textos do resumo e do lembrete |
| `src/lib/email.ts` | Envio pelo SMTP do escritorio, em lote |
| `src/lib/whatsapp.ts` | Cloud API da Meta: so modelo aprovado, e leitura dos erros |
| `src/lib/modelos-whatsapp.ts` | Os modelos submetidos a Meta e seus parametros |
| `src/lib/arquivos.ts` | Regras do arquivo: tipo, tamanho, cota e exclusao |
| `src/lib/armazenamento.ts` | Onde o byte fica; caminho nunca vem do usuario |
| `src/lib/cobrancas.ts` | Cobranca do cliente pelo Asaas do escritorio, e a baixa |
| `src/lib/djen.ts` | Cliente do DJEN, escolha do rele e mapeamento dos campos |
| `rele/api/djen.ts` | Rele do DJEN na Vercel, regiao gru1 (implantado sozinho) |
| `src/lib/leitura-publicacao.ts` | Prazo, urgencia e grafia do numero do processo |
| `src/lib/publicacoes.ts` | Captura por OAB, deduplicacao e vinculo |
| `src/lib/catalogo.ts` | Modulos, faixas e metricas — so constantes, sem servidor |
| `src/lib/faixas.ts` | Limite de pessoas por faixa contratada |
| `src/lib/precos.ts` | Tabela de precos (PROVISORIA) e regua de atraso |
| `src/lib/cobranca.ts` | Plataforma cobrando do escritorio: teste, fatura, atraso, suspensao |
| `src/lib/plataforma.ts` | Guarda do operador e auditoria de acesso |
| `src/lib/exportacao.ts` | Exportacao completa dos dados do escritorio |
| `src/lib/backup.ts` | Backup e restauracao por escritorio |
| `src/lib/encerramento.ts` | Encerramento, prazo de retencao e purga |
| `src/lib/aceite.ts` | Registro de aceite dos documentos |
| `src/lib/limite.ts` | Limite de tentativas por IP, contado no banco |
| `src/lib/csp.ts` | Politica de seguranca de conteudo com nonce |
| `src/app/api/webhooks/asaas/` | Baixa automatica da fatura da plataforma |
| `docs/juridico/` | Minutas de contrato, termos, LGPD, SLA e privacidade |
| `docs/SEGURANCA.md` | O que o sistema faz de seguranca, e o que ainda nao faz |
| `src/lib/conectores/` | Um conector por integracao: campos, resumo e teste |
| `src/lib/integracao.ts` | Credenciais cifradas por escritorio |
| `src/lib/consumo.ts` | Medicao mensal, franquia e excedente |
| `src/lib/fila.ts` | Fila no PostgreSQL, um trabalho por escritorio |
| `src/lib/trabalhos.ts` | O que cada trabalho faz e o espalhamento |
| `scripts/trabalhador.ts` | Processo que consome a fila |
| `src/lib/respostas.ts` | Erro de dominio -> HTTP, em um lugar so |
| `src/componentes/FormularioCriar.tsx` | Formulario de criacao das quatro telas |
| `src/lib/integracao.ts` | Credenciais por escritorio |
| `src/lib/segredo.ts` | AES-256-GCM das credenciais |
| `testes/isolamento.test.ts` | Bateria de isolamento (10 casos) |
| `testes/autenticacao.test.ts` | Senha, 2FA, subdominio e sessao (13 casos) |
| `testes/conta.test.ts` | Troca de senha, 2FA e usuarios por escritorio (4 casos) |
| `testes/fase2.test.ts` | Modulo, faixa, consumo e fila (19 casos) |
| `testes/conectores.test.ts` | Conectores contra SMTP/HTTP locais (24 casos) |
| `testes/fase4.test.ts` | Regua, fatura, pagamento e exportacao (19 casos) |
| `testes/fase5.test.ts` | Backup/restauracao, aceite, purga e limite (24 casos) |
| `testes/publicacoes.test.ts` | Triagem, cliente do DJEN e captura (28 casos) |
| `testes/avisos.test.ts` | Textos, idempotencia e envio real por SMTP (16 casos) |
| `testes/ia.test.ts` | Instrucoes, medicao, recusa e travas (17 casos) |
| `testes/migracoes.test.ts` | Ordem das migracoes: alfabetica = numerica (3 casos) |
| `testes/whatsapp.test.ts` | Telefone, modelos, idempotencia e erros da Meta (15 casos) |
| `testes/arquivos.test.ts` | Tipo, caminho, cota, isolamento e purga (15 casos) |
| `testes/cobrancas.test.ts` | Emissao, baixa unica, cancelamento e isolamento (19 casos) |
| `testes/rele.test.ts` | Token, parametro estranho e repasse do rele (15 casos) |
| `scripts/preparar-banco.sql` | Cria os tres papeis; roda uma vez |
| `.github/workflows/ci.yml` | Roda a bateria contra Postgres real a cada push |

## Regras de contribuicao

1. Nenhuma consulta de negocio fora de `comEscritorio()`.
2. Nenhuma credencial de escritorio em variavel de ambiente.
3. Nenhum nome, telefone, cidade, endereco ou cor de escritorio fixo no codigo.
4. Toda rota nova entra tambem na bateria de isolamento.
5. Nenhum arquivo, dado ou dependencia vindo de outro sistema.
6. `prismaPlataforma()` atravessa o RLS — so no plano de controle, nunca em
   rota de escritorio.
7. Nenhuma decisao de acesso a partir do corpo da requisicao: escritorio e
   status saem do endereco, resolvidos no servidor.
8. Rota que recebe id de outro registro (ex.: `clienteId`) confere que ele e
   deste escritorio antes de usar.
9. Nenhuma rota devolve `senhaHash` nem `doisFatores`.
10. Area de modulo some do menu **e** responde 403 na rota — as duas, nunca
    so uma.
11. Modulo e faixa sao contratados pela plataforma. O escritorio nao se
    concede um modulo nem muda a propria faixa.
12. Credencial de integracao nunca volta para a tela, nem para quem a
    cadastrou: so status, resumo mascarado e ultimo erro.
13. Conector sem verificacao automatica diz isso na tela. Botao de testar que
    sempre responde "ok" e pior do que nao ter botao.
14. Constante usada por componente de cliente mora em `catalogo.ts` ou
    `auth-comum.ts`. Importar de um modulo que toca o Prisma arrasta o banco
    para o bundle do navegador e quebra o build.
15. Operador da plataforma e escritorio sao mundos separados: a sessao de um
    nao vale no outro, e todo acesso do operador a um escritorio fica em
    `AcessoSuporte`.
16. Mudou o texto de um documento juridico, suba `VERSAO_DOS_DOCUMENTOS`. Sem
    isso, o aceite ja gravado passa a apontar para um texto que ninguem leu.
17. Backup leva credencial cifrada e serve para restaurar; exportacao nao leva
    segredo nenhum e serve para o cliente levar os dados embora. Nao confundir
    os dois.
18. Migracao que mexe em DADOS precisa suspender o `FORCE ROW LEVEL SECURITY`
    da tabela e repor no fim. Sem isso o `UPDATE` afeta zero linhas em silencio,
    porque o proprio usuario de migracao esta sob a politica.
19. Saida de IA e rascunho, e a tela diz isso. As instrucoes proibem inventar
    fundamentacao; prazo detectado e sempre "conferir nos autos".
