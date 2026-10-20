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

## Provas antes dos escritorios de fora (16/10/2026)

**Isolamento, em producao, com dois escritorios criados pelo cadastro
publico** (`ensaio-iso-a` e `ensaio-iso-b`, encerrados depois): 16 de 16.
Com a sessao de B, o cliente e o arquivo de A nao aparecem na lista nem na
busca, e ler, alterar ou apagar pelo id da 404; subir arquivo na pasta do
cliente de A e recusado; a sessao de um nao vale no endereco do outro (401);
a rota interna de arquivos nao responde pela internet (404). A continuou
vendo e baixando o que era seu.

**Desempenho**, nas paginas principais (inicio, clientes, processos, agenda,
publicacoes, tarefas, financeiro) dos dois escritorios ao mesmo tempo:
480 pedidos com 30 simultaneos em 8,3 s (58 por segundo), todos 200,
mediana 0,43 s, p95 0,73 s, maximo 1,04 s. A saude da plataforma seguiu em
0,3 s e nenhuma rotina falhou.

**Aviso de pagamento no Asaas**: "BIRDJUD CORRETO" ->
`https://app.birdjud.com.br/api/webhooks/asaas`, ativo, fila andando.

## Advocacia Roma em cortesia (11/10/2026)

Decisao: a ADVOCACIA ROMA fica em **cortesia ilimitada**, para os testes
correrem sem cobranca. A regua nao gera fatura, o escritorio fica ATIVO e o
painel da plataforma o tira da receita e da previsao. Concede-se e retira-se
na ficha do escritorio no console (`Cortesia`), com motivo registrado.

## Impedem o uso real

### 1. A senha de administracao nao existe `[voce]`

Ela destrava financeiro, certificado A1 e identidade do escritorio. Sem ela, o
proprio escritorio nao preenche nada disso sozinho — foi por isso que o CNPJ
precisou ser gravado pelo console do operador.

### 2. O advogado nao foi criado, e nenhuma OAB e monitorada `[voce + nos]`

Sem OAB cadastrada, a captura do DJEN nao tem o que buscar — e e o modulo que
mais vende o produto. O rele esta no ar e provado com dado real do CNJ. Falta
o cadastro.

### 3. Nada na frente do sistema `[nos]`

Ver `docs/CLOUDFLARE.md`. Desbloqueado em 20/10/2026: a zona `birdjud.com.br`
foi refeita numa conta com acesso, com os mesmos registros. Falta ligar a
nuvem laranja na ordem do documento.

### 4. Monitor externo — resolvido em 11/10/2026

O GitHub Actions confere o sistema de fora do Railway a cada 10 minutos
(saúde com banco, entrada, site, certificado). Quando cai, abre uma issue e o
GitHub manda e-mail ao dono do repositório. Ver `docs/VIGIA-EXTERNO.md`.

Em 13/10/2026 a rotina LEMBRAR de um escritório ficou horas parada (erro
25P02: alerta de falha repetido dentro da transação) com o site respondendo
normalmente. Corrigido no mesmo dia, e o vigia passou a conferir também
`/api/saude/rotinas`: trabalhador parado ou rotina essencial com a última
execução em falha abre o mesmo alarme.

### 5. Regra de 90 dias no balde do R2 — resolvido em 20/10/2026

O balde antigo estava numa conta da Cloudflare sem acesso. O backup passou a
ir para `birdjud-backup` na conta de advocaciaromagba@gmail.com (a mesma do
dominio), com a regra `expurgo-90-dias` conferida pela API do balde. Os
backups anteriores ficaram na conta antiga e deixam de importar em 90 dias.

## Fazem falta antes do segundo escritorio

### 6. Documentos juridicos — resolvido em 16/10/2026

Revisados por Jose Luciano da Costa Roma, encarregado de dados (LGPD) da
plataforma. Contratada BLACKBIRD SOLUCOES ESTRATEGICAS LTDA (CNPJ
30.044.017/0001-01), foro de Guariba/SP, IPCA, contato e suporte em
contato@blackbirdsolucoes.com.br. Hospedagem mantida em Amsterda, com a
transferencia internacional e os suboperadores declarados no Acordo LGPD.
Versao `2026-10-16`: cada escritorio aceita de novo no proximo acesso.

### 7. Onboarding — resolvido em 09/10/2026

Roteiro de primeiros passos em tres fases, com o porque de cada passo, que se
marca sozinho pelo estado real do escritorio. Ver `docs/PRIMEIROS-PASSOS.md`.

### 8. Conta Asaas compartilhada entre sete sistemas `[voce]`

A separacao por marca de sistema (`birdjud:fatura:<id>`) faz funcionar, mas e
remendo sobre conta compartilhada, nao isolamento: a chave de producao e a
mesma para os sete, e revogar por causa de um derruba os outros seis.

## Ficam para depois do piloto

- **WhatsApp**: envio provado em 11/10/2026 — mensagem de modelo entregue
  num celular real. Os 7 modelos estao aprovados (texto identico ao do
  codigo); o 8o, `birdjud_mensagem_nao_entregue`, aprovado em 12/10/2026. Forma de
  pagamento e informacoes fiscais cadastradas na Meta (os erros 141006 e
  131042 acabaram). Nome de exibicao "BirdJud" pedido em 11/10, em analise
  na Meta.
- **NFS-e**: **validada em producao em 13/10/2026** — primeira nota real
  emitida pelo BirdJud (Advocacia Roma), conferida pelo escritorio e sem
  ajuste. O PDF entrou na pasta do cliente; a copia para a nuvem, que falhou
  pelo volume preso a aplicacao, foi corrigida e refeita em 14/10/2026.
- **Acessibilidade**: auditoria automática (axe) feita e corrigida em
  11/10/2026, ver `docs/ACESSIBILIDADE.md`. Falta teste com leitor de tela
  de verdade.
- **Desempenho sob carga**: medido em 16/10/2026 com dois escritorios (ver
  "Provas antes dos escritorios de fora"). Falta medir com volume real de
  dados (milhares de processos e publicacoes por escritorio).
- **Expurgo dos registros de acesso de suporte**: resolvido em 11/10/2026 —
  guarda de 12 meses, rotina semanal `LIMPAR_VENCIDOS`. Falta declarar o
  prazo nos Termos na proxima revisao juridica (ver `docs/juridico/LEIA-ME.md`).
- **Varredura por mais confianca em cabecalho de visitante**: em 04/10 foi
  achado um ponto (a origem das tentativas). Nao ha base para dizer que era o
  unico.

## Auditoria de 18/10/2026: queda e espaco

Medido ao vivo no Railway: arquivos 2%, banco 5%, copias 2% dos volumes de
5 GB; memoria 2%; CPU perto de zero; paginas em 0,5 a 0,9 s de fora.

- **Gravacao longa de entrevista** — resolvido em 18/10/2026: acima de 25 MB
  a gravacao inteira nao era guardada. Agora vai em partes de 8 MB, ate
  300 MB; download em fluxo (ver `docs/ENTREVISTAS.md`).
- **Ninguem avisava quando o disco enche** — resolvido em 18/10/2026: alarme
  proprio do vigia externo acima de 70% (ver `docs/VIGIA-EXTERNO.md`).
- Resolvidos em 20/10/2026: Resend em `envio.birdjud.com.br` (Gmail de
  reserva), zona da Cloudflare em conta com acesso, balde novo do R2 com a
  regra de 90 dias. Em aberto `[voce]`: conta Asaas compartilhada.
- Para depois de ~10 escritorios: uma so instancia do APP, com o volume
  preso a ela (R2 para os arquivos, duas copias, plano Pro).

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
