# Agenda

Audiencias, pericias, reunioes, prazos e tarefas do escritorio, numa tabela
so: quando, tipo, titulo (com o processo embaixo), advogado(a), cliente ou
quem vai, sala, status — e as acoes **Ver**, **Editar**, **Avisar**,
**Excluir**.

A regra que atravessa a tela inteira: **nada some sem registro**. O que
saiu da agenda esta em "Excluidos (auditoria)"; todo aviso que o sistema
mandou esta em "Notificacoes enviadas". E para isso que as duas existem:
responder com registro quando alguem diz "ninguem me avisou" ou "essa
audiencia nunca esteve na agenda".

## As quatro acoes

| acao | o que faz | rastro |
| --- | --- | --- |
| Ver | abre a linha: dados, quem vai (com confirmacao pelo WhatsApp) e os avisos que sairam deste compromisso | — |
| Editar | formulario preenchido; `PATCH /api/compromissos/{id}` | data alterada **cancela os lembretes pendentes** (viram `CANCELADO`, a chave e liberada) e a regua gera de novo com a hora nova; responsavel novo recebe a designacao |
| Avisar | manda AGORA a confirmacao, o lembrete de vespera ou o de 1 hora, para todos os participantes; `POST /api/compromissos/{id}/avisar` | cada clique e um aviso novo (a chave leva a hora do pedido), entregue pelo trabalhador em segundos |
| Excluir | tira da agenda; `DELETE /api/compromissos/{id}` | copia para `CompromissoExcluido` com motivo `EXCLUIDO` e quem apagou; pendentes cancelados; **enviados ficam** |

"Agendar lendo documento" e o mesmo formulario com o leitor de documentos
(modulo IA) aberto em cima: intimacao, mandado ou e-mail viram titulo, data,
local e observacoes para conferir.

## O que sai sozinho

`ARQUIVAR_AGENDA` roda uma vez por dia (cron-diario) para todo escritorio:
audiencia, pericia e reuniao cujo horario passou ha mais de
`HORAS_DE_SEGURANCA` (4 h) vao para a auditoria com motivo `VENCIDO`. A
margem existe porque audiencia atrasa e pericia se estende — sumir da agenda
no meio do ato deixaria quem esta no forum sem o link da sala.

**Prazo e tarefa nunca sao arquivados pelo relogio.** Prazo vencido nao e
historia, e problema: fica na frente de alguem ate ser dado como cumprido.

## Auditoria de notificacoes

`Aviso.compromissoId` liga cada aviso ao compromisso que o gerou (a migracao
45 preencheu os antigos a partir da chave). A tela lista confirmacao,
lembretes ao participante, lembretes a equipe e designacao, por WhatsApp e
e-mail, com destinatario (nome resolvido pelos digitos do telefone ou pelo
e-mail), data, hora e desfecho: **Enviado, Na fila, Falhou, Cancelado**.

Mostra tambem os que falharam e os cancelados, de proposito. A pergunta da
auditoria e "a pessoa foi avisada?", e "tentamos e falhou" e uma resposta.
Quando o compromisso ja saiu da agenda, o aviso fica (o vinculo vira nulo) e
a linha mostra o assunto no lugar do titulo.

## Sala virtual

`Compromisso.link` guarda o link que o tribunal mandou (Teams, Zoom, Webex)
ou o Meet da reuniao. Aparece na coluna **Sala** como "Entrar" e no "Ver".

## Onde esta no codigo

- `src/lib/agenda-do-escritorio.ts` — editar, excluir, arquivar, auditorias
- `src/lib/avisos.ts` → `avisarAgora` — o botao Avisar
- `src/lib/agenda-tela.ts` — busca e status, sem React (tem teste)
- `src/componentes/PainelAgenda.tsx` — a tela
- `src/app/api/compromissos/[id]`, `.../avisar`, `.../excluidos`, `.../notificacoes`
- testes: `testes/agenda-do-escritorio.test.ts`, `testes/agenda-tela.test.ts`, isolamento de `CompromissoExcluido`
