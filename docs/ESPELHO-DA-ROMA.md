# Acompanhar o sistema da Advocacia Roma

O BirdJud e o sistema da Advocacia Roma sao DOIS sistemas, independentes. Nao
ha comunicacao entre eles: nenhuma chamada, nenhuma tabela compartilhada,
nenhum dado copiado. O que passa de um para o outro e so a IDEIA de cada
atualizacao: a funcionalidade que o escritorio pediu, provou no dia a dia, e
que serve a qualquer escritorio.

Este roteiro diz como conferir, de tempos em tempos, o que a Roma ganhou de
novo e como trazer isso para ca do jeito certo.

## Ponto da ultima revisao

| O que | Valor |
|---|---|
| Repositorio da Roma | `advocaciaromagba-web/sistema-advocacia-roma`, ramo `main` |
| Ultimo commit revisado | `78e636bdf083b6982548620200842cb14da0dd2b` (28/10/2026, "Campo solução na tarefa: o que foi feito para resolver") |
| Revisado em | 29/10/2026 |

Ao terminar uma rodada, troque o hash e a data desta tabela no mesmo commit em
que a ultima funcionalidade entrou. Sem isso a proxima rodada revisa tudo de
novo.

## Como listar o que e novo

Com um clone local da Roma (o caminho e so o da sua maquina; nada do clone
entra neste repositorio):

```sh
scripts/novidades-da-roma.sh /caminho/do/clone/da/roma
```

O script le o hash desta pagina e lista os commits da Roma depois dele, com
os arquivos tocados. Sem argumento, procura o clone em `../sistema-advocacia-roma`.

## O que fazer com cada novidade

Para cada commit da lista, decidir uma de tres coisas:

1. **Ja existe no BirdJud.** Conferir se o comportamento e o mesmo (inclusive
   os casos de borda que o commit da Roma corrigiu) e seguir.
2. **Existe em parte.** Completar aqui, no padrao deste sistema.
3. **Nao existe.** Reescrever aqui. Nunca copiar o arquivo.

"Reescrever" quer dizer, sempre:

- **Multi-escritorio.** Tudo passa por `comEscritorio` e pelo RLS; nenhuma
  consulta sem `escritorioId`. Tela que na Roma e do "administrador" aqui e
  do papel ADMIN do escritorio, e o que e fechado por senha de administracao
  continua fechado.
- **Por modulo.** Funcionalidade que depende de Financeiro, Cobrancas,
  WhatsApp etc. so aparece com o modulo contratado, e nunca vem vazia.
- **Sem dados, sem nomes, sem credenciais.** Nenhum cliente, processo,
  telefone, chave, URL interna ou nome da banca da Roma entra aqui. Teste
  usa dado inventado (CPF de teste `52998224725`, nomes genericos).
- **Script de producao vira tela ou rotina.** O que na Roma e um script que
  a equipe roda contra o banco, aqui e uma pagina, uma API ou uma rotina do
  trabalhador: o escritorio nao tem terminal.
- **Com teste.** Cada regra ganha o teste que a protege, em `testes/`, com a
  nota de "o que protege o escritorio" no cabecalho.
- **Portugues correto na tela, codigo sem acento.** Regra 18 do README.
- **Documentar aqui.** Anotar na tabela abaixo o que entrou e onde.

## O que ja foi trazido

| Novidade da Roma | Onde esta no BirdJud |
|---|---|
| Editar dados da equipe (nome, e-mail, papel, OAB, telefone, ativo) | `src/lib/equipe.ts` `editarPessoa`, `PATCH /api/usuarios/[id]`, `EditarUsuario.tsx` |
| Anexar documentos na tarefa, inclusive na criacao; mesmo nome nao sobrescreve | `Arquivo.tarefaId` (migracao 66), `src/lib/arquivos.ts`, `PainelTarefas.tsx` |
| Documento lido vira varias providencias de uma vez; sem prazo, pede a data | `src/lib/leitura-documento.ts` `outras`, `PainelTarefas.tsx` |
| Uma mensagem por pessoa, nao uma por tarefa | `src/lib/avisos.ts` `gerarLembretesDeTarefas` |
| Media mensal e projecao do ano | `src/lib/metas-do-escritorio.ts`, `PainelDoAno.tsx` |
| Recebimentos no painel do administrador | `src/lib/painel.ts` `recebidoNoMes`, `src/app/page.tsx` |
| Link direto nos avisos (agenda, tarefas, publicacoes, financeiro, cobrancas) | `textos-aviso.ts`, `resumo-do-dia.ts`, `contas-do-escritorio.ts` `rota` |
| Conciliacao contratos x financeiro | `src/lib/conciliacao-de-contratos.ts`, `/financeiro/contratos` |
| Publicacoes agendam com o seletor de participantes da Agenda | `ListaPublicacoes.tsx` usa `ParticipantesDoCompromisso` |
| Enviar documentos ao cliente por WhatsApp ou e-mail, canal escolhido na hora | `src/lib/documento-por-email.ts`, `POST /api/modelos/[especie]/mandar`, `PecasDoCliente.tsx` |
| Entrevista sem cliente, PDF na pasta do cliente | `Entrevista.clienteId` opcional e `nome` (ja existia; ver `docs/ENTREVISTAS.md`) |
| Alerta sonoro 1h e 15min antes | `src/lib/alerta-da-agenda.ts`, `AlertaDaAgenda.tsx`, `Usuario.alertaSonoro` |
| Parcela de contrato no financeiro, com baixa na mesma linha | `src/lib/honorarios-do-escritorio.ts` (ja existia) |
| Estagiario(a) como papel: apoio, sem nada privativo de advogado (faixa, peticao inicial, DJEN por OAB) | `src/lib/papeis.ts` `ESTAGIARIO`, `rotuloDoPapel`; `contaComoAdvogado` em `equipe.ts` |
| Envio automatico por canal, por cliente, com o motivo na tela e a fila cancelada | `Cliente.notificarWhatsapp`/`notificarEmail` (migracao 72), `src/lib/consentimento-de-envio.ts`, `src/lib/envio-do-cliente.ts`, `/administracao/envios`, ficha do cliente |
| Administrador liga e desliga os avisos de cada pessoa da equipe | `EditarUsuario.tsx` + `PATCH /api/usuarios/[id]` (`recebeResumo`, `recebeLembretes`, `recebeWhatsapp`) |
| Entrevista sem cliente; peticao inicial exige cliente cadastrado | ja existia (`entrevista-do-escritorio.ts` `gerarMinuta`) |
| Restaurador do backup e plano de continuidade | ja existia (`scripts/restaurar-copia.mjs`, `scripts/restaurar-escritorio.ts`, `docs/BACKUP.md`, `docs/RAILWAY.md`) |
| Modelo da Meta para documento fora da janela de 24 h | ja existia (`src/lib/documento-no-whatsapp.ts`) |
| Mapa das variaveis para o cofre | ja existia (`docs/RAILWAY.md`, secao 3; valores no Bitwarden) |
| Cliente menor: documento no nome dele, representado (ate 16) ou assistido (16 a 18) por quem exerce o poder familiar; assina quem representa | `Cliente.menor`, `Representante.parentesco` (migracao 73), `src/lib/menor.ts`, `qualificacaoDoCliente` em `modelos-do-escritorio.ts`, `assinatura-do-escritorio.ts`, `MenorDeIdade.tsx` |
| Solucao da tarefa: o que foi feito, com autor e data; "Concluir" abre o campo; apagar o texto apaga a assinatura | `Tarefa.solucao`/`solucaoEm`/`solucaoPorId` (migracao 74), `registrarSolucao` em `tarefas-do-escritorio.ts`, `PATCH /api/tarefas/[id]`, `PainelTarefas.tsx` |
| Campo de cliente com busca no lugar do `<select>` que cortava os nomes (busca sem acento e por CPF/CNPJ, botao de limpar) | `SeletorDeCliente.tsx`, `src/lib/busca-de-cliente.ts`; Agenda, Tarefas, Publicacoes, Entrevistas, Notas, Arquivos, Cobrancas |
| CPF/CNPJ do cliente informado na propria tela de cobranca, gravado no cadastro com as conferencias (digito, duplicado, representante de PJ); exige a area Clientes | `completarDocumentoDoCliente` em `cobrancas.ts`, `POST /api/cobrancas` (`documentoDoCliente`), `FormularioCriar` (`seClienteSemDocumento`) |
| Cliente removido no painel do Asaas: o vinculo e conferido e recuperado (duplicado ativo, restaurar, ou criar) | `clienteNoAsaas` e `situacaoDoClienteNoAsaas` em `cobrancas.ts` |
| Campo de valor em real ("1.500,00") | ja existia (`paraCentavos` em `dinheiro.ts`; nenhum campo de dinheiro usa `type="number"`) |
| Assinatura concluida nao vira aviso de tarefa | nao se aplica: o BirdJud nao cria aviso de tarefa ao assinar |
| Reenviar para assinatura o que falta: uma mensagem por pessoa, por e-mail ou WhatsApp (so ao proprio cliente), conferindo antes no Autentique; resultado na linha de quem foi clicado; motivo de cada documento de fora | `src/lib/reenvio-de-assinatura.ts`, `POST /api/assinaturas/reenviar`, `PecasDoCliente.tsx` |
| Gravar quem ja assinou mesmo com o documento pendente, com data na tela, e conferir sozinho de hora em hora | `conferirPendentes` em `assinatura-do-escritorio.ts`, trabalho `CONFERIR_ASSINATURAS` (cron-horario) |
| Uma procuracao para cada acao contratada; acoes no cadastro; a acao entra no nome do arquivo e no titulo; trava de envio repetido compara pelo documento | `Cliente.acoesContratadas` (migracao 75), `DadosDaPeca.acao`, `nomeDoArquivoDaPeca`/`tituloDaPeca` em `modelos-do-escritorio.ts`, `PecasDoCliente.tsx` |
| Mensalidade (assinatura do Asaas): criar, mudar valor (vale para o boleto pendente), suspender, reativar, encerrar; cada boleto gerado pelo Asaas vira linha aqui; o que o Asaas apagou vira cancelada | `Mensalidade` (migracao 76), `src/lib/mensalidades.ts`, `/api/mensalidades`, `PainelMensalidades.tsx`, sincronizacao no `SINCRONIZAR_COBRANCAS` |
| Ciclos semanal e quinzenal (e bimestral a anual); ciclo desconhecido do Asaas e recusado, nunca vira "todo mes" | `CICLOS` e `cicloDoAsaas` em `mensalidades.ts` |
| Trazer as assinaturas que ja existem no painel do Asaas, reconhecendo o cliente pela conta ou pelo CPF/CNPJ; criar mensalidade recusa quando ja ha uma ativa la | `assinaturasDeFora`, `trazerDoAsaas`, `criarMensalidade` |
| Historico trazido ja pago nao gera receita no Financeiro (contaria duas vezes) | `Cobranca.semBaixa` (migracao 76), `espelharCobrancaDaMensalidade` |
| Fatura parcelada: N cobrancas ligadas no Asaas, valor como total ou por parcela, uma linha por parcela | `parcelas`/`valorRefereA` e `espelharParcelas` em `cobrancas.ts`, `Cobranca.parcelamentoId` |
| Baixa manual parcial e retroativa, com historico (quem, quando, observacao) e desfazer; quitada por aqui, o Asaas da como recebido em dinheiro; parcial + boleto pago depois nao conta o parcial duas vezes | `BaixaDeCobranca` (migracao 77), `src/lib/baixas-de-cobranca.ts`, `/api/cobrancas/[id]/baixa`, `sincronizarCobrancas` (status PARCIAL) |
| Reemitir boleto sem avisar o cliente: vencimento (e valor) novo, link e linha digitavel na tela | `reemitirBoleto`, `/api/cobrancas/[id]/reemitir` |
| Cobrancas remodelada: abas A receber / A pagar, resumo (em aberto, vencido, recebido em 30 dias), busca, filtros, agrupada por cliente com atrasado em cima, "parcela 2 de 3" | `PainelCobrancas.tsx`, `src/app/cobrancas/page.tsx`; A pagar so com o Financeiro destrancado (segunda senha) |
| Menor cadastrado a partir de quem o representa, sem herdar RG e CPF | `Cliente.responsavelClienteId`, `src/lib/menores-do-escritorio.ts`, `POST /api/clientes/[id]/menores`, `MenoresDoCliente.tsx`; nascimento na leitura por IA ja existia (instrucao reforcada) |
| Audiencia e pericia com responsavel que nao e advogado: aviso, nao bloqueio | `atoSemAdvogado` em `src/lib/agenda-tela.ts`, `PainelAgenda.tsx` |
| Cobrancas sem a segunda senha; Financeiro com ela | ja era assim (so lancamentos, despesas e metas pedem a senha) |
| Cobranca de todo contrato parcelado, pela forma do contrato | ja existia (`honorarios.ts` `planoDoContrato`; emissao automatica so com o escritorio ligando) |
| Responsavel de qualquer papel e agenda visivel para o escritorio | ja era assim (toda a equipe ve a agenda do escritorio) |
| Prazo pela lei e aviso antes do fatal; um aviso por vez | `src/lib/prazos*.ts`, `avisos.ts` (ja existia) |
| Processo e cliente cadastrados a partir da publicacao | `CadastrarProcesso.tsx`, `triagem-do-escritorio.ts` (ja existia) |

Ainda nao trazido, por ser maior e pedir decisao do produto:

- Conciliacao dos contratos guardados na pasta do cliente (leitura por IA
  do PDF) com o cadastro de honorarios.

## Nao trazido, de proposito

| Novidade da Roma | Por que |
|---|---|
| Atendimento virtual: avisar que o Meet nao sera gerado e gerar a sala depois (25/10/2026) | No BirdJud a sala virtual e colada a mao no compromisso (Teams, Zoom, Webex ou Meet); nao ha geracao automatica pelo Google Agenda, entao o problema que a Roma corrigiu nao existe aqui. Gerar o Meet sozinho seria funcionalidade nova (conectar a agenda Google de cada advogado), a decidir. |
