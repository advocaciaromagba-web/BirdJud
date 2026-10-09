# Auditoria: o que falta

Refeita em 06/10/2026 contra o que esta em producao em `birdjud.com.br`.
A versao anterior era de 25/09 e ficou errada em quase tudo: falava em 326
testes e 20 tabelas sob RLS, e dava como pendentes itens ja entregues.

Cada item diz quem resolve — `[nos]` e trabalho de codigo, `[voce]` depende de
uma decisao, uma credencial ou um contrato.

## Onde o sistema esta

Tres medidas diferentes, porque uma so engana:

| Dimensao | Onde esta |
| --- | --- |
| Codigo e infraestrutura | praticamente pronto |
| Credenciais de producao | quase todas ligadas |
| **Provado com uso real** | **quase nada** |
| Pronto para vender a terceiros | pela metade |

A terceira linha e a que importa. O sistema esta construido e esta no ar; o
que ele ainda nao tem e um processo de verdade passando por dentro dele.

Medido no console da plataforma em 06/10: ADVOCACIA ROMA tem **1 usuario e 0
registros**. Nenhum cliente, nenhum processo, nenhuma publicacao capturada,
nenhuma fatura emitida, nenhum pagamento recebido.

## Prazo que esta correndo

**12/10/2026**: acaba o teste da ADVOCACIA ROMA (R$ 299,00/mes, vencimento dia
10). Quando a regua passar, ela agora **emite cobranca de verdade** no Asaas —
boleto e Pix — e manda o link por e-mail ao administrador. E a Blackbird
cobrando a Advocacia Roma, as duas suas. Decidir antes se e isso mesmo:
estender o teste, cancelar a assinatura ou deixar correr para provar o ciclo.

## Impedem o uso real

### 1. A senha de administracao nao existe `[voce]`

Ela destrava financeiro, certificado A1 e identidade do escritorio. Sem ela, o
proprio escritorio nao preenche nada disso sozinho — foi por isso que o CNPJ
precisou ser gravado pelo console do operador.

### 2. O advogado nao foi criado, e nenhuma OAB e monitorada `[voce + nos]`

Sem OAB cadastrada, a captura do DJEN nao tem o que buscar — e e o modulo que
mais vende o produto. O rele esta no ar e provado com dado real do CNJ. Falta
o cadastro.

### 3. Nada na frente do sistema `[voce]`

Ver `docs/CLOUDFLARE.md`. Bloqueado: a zona `birdjud.com.br` esta na
Cloudflare (nameservers `ingrid` e `salvador`), mas nao na conta a que temos
acesso. Enquanto a conta nao for encontrada, nao ha o que ligar.

### 4. Monitor externo `[nos + voce]`

O vigia roda dentro do mesmo provedor que vigia. Se o ambiente inteiro cair,
ele cai junto e ninguem e avisado. Plano gratuito de UptimeRobot ou Better
Stack basta.

### 5. Regra de 90 dias no balde do R2 `[voce]`

O backup cifrado sobe todo dia e a restauracao foi ensaiada, mas sem a regra
de expurgo o balde cresce para sempre. O token tem permissao de objeto, nao de
administracao do balde: tem de ser clicado no painel.

## Fazem falta antes do segundo escritorio

### 6. As minutas juridicas nao foram revisadas por advogado `[voce]`

O mecanismo de aceite esta certo — data, hora, IP e versao. O **texto** e
rascunho meu.

### 7. Onboarding — resolvido em 09/10/2026

Roteiro de primeiros passos em tres fases, com o porque de cada passo, que se
marca sozinho pelo estado real do escritorio. Ver `docs/PRIMEIROS-PASSOS.md`.

### 8. Conta Asaas compartilhada entre sete sistemas `[voce]`

A separacao por marca de sistema (`birdjud:fatura:<id>`) faz funcionar, mas e
remendo sobre conta compartilhada, nao isolamento: a chave de producao e a
mesma para os sete, e revogar por causa de um derruba os outros seis.

## Ficam para depois do piloto

- **WhatsApp**: dois modelos aprovados na Meta e as credenciais do escritorio.
- **NFS-e**: layout marcado "a conferir"; rodar `npm run conferir-nfse` com
  certificado A1 em homologacao antes de emitir nota de verdade.
- **Acessibilidade**: nunca auditada com leitor de tela.
- **Desempenho sob carga**: nunca medido com mais de um escritorio ativo.
- **Expurgo dos registros de acesso de suporte**: declarado, sem rotina.
- **Varredura por mais confianca em cabecalho de visitante**: em 04/10 foi
  achado um ponto (a origem das tentativas). Nao ha base para dizer que era o
  unico.

## O que esta pronto, e foi conferido

- **isolamento entre escritorios** em duas camadas independentes (extensao do
  Prisma e RLS com FORCE em 22 tabelas), conferido a cada arranque pelo
  `conferir-producao`, que recusa subir se nao estiver de pe;
- **549 testes** passando, incluindo seguranca, migracao, preco, isolamento e
  as decisoes de alarme;
- **backup cifrado fora do provedor** (AES-256-GCM no R2 da Cloudflare), com
  caminho de restauracao provado e vigia proprio: se o backup parar de subir,
  o alarme e separado do alarme de queda, porque backup parado nao e queda;
- **cobranca da plataforma de ponta a ponta**: emissao marcada por sistema,
  webhook que separa os sete sistemas da conta sem travar a fila, e baixa que
  registra quem pagou, quanto e por qual caminho;
- **certificado conferido na origem**, por tras de qualquer borda — a licao de
  28/09, quando um certificado em falha derrubou o sistema inteiro e o vigia
  nao viu;
- **origem das tentativas confiavel**: ate 04/10 quem chamava escolhia a
  propria identidade e desligava todos os tetos de uma vez;
- **dominio, certificado e subdominio por escritorio**, com prova de ponta a
  ponta em producao;
- **tres papeis de banco**, com a aplicacao sem BYPASSRLS e sem ser dona das
  tabelas;
- **segredos cifrados** por escritorio, CSP com nonce por requisicao, sessao
  revogavel;
- **os nove modulos** escritos e testados: DJEN, WhatsApp, e-mail, NFS-e,
  cobrancas, financeiro, assinatura eletronica, IA e arquivos.

## Ordem que eu seguiria

1. Senha de administracao (destrava tres telas de uma vez);
2. Criar o advogado e a OAB, e disparar a captura do DJEN — o primeiro dado
   real entrando no sistema;
3. Decidir o que fazer com o vencimento do teste em 12/10;
4. Achar a conta da Cloudflare e ligar a nuvem laranja;
5. Monitor externo e regra de 90 dias no R2;
6. Revisao juridica das minutas, em paralelo com tudo acima.
