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
| Ultimo commit revisado | `819d29d606ba1b08dae9f19085d27fdb87a4d483` (21/10/2026, "Enviar documentos ao cliente pelo WhatsApp ou e-mail") |
| Revisado em | 21/10/2026 |

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
| Prazo pela lei e aviso antes do fatal; um aviso por vez | `src/lib/prazos*.ts`, `avisos.ts` (ja existia) |
| Processo e cliente cadastrados a partir da publicacao | `CadastrarProcesso.tsx`, `triagem-do-escritorio.ts` (ja existia) |

Ainda nao trazido, por ser maior e pedir decisao do produto:

- Conciliacao dos contratos guardados na pasta do cliente (leitura por IA
  do PDF) com o cadastro de honorarios.
