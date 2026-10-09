# Entrega das mensagens ao cliente

Antes, "Enviado" queria dizer só que a Meta **aceitou** a mensagem. Se ela
chegou ao celular do cliente, ninguém sabia. Agora o sistema lê o retorno de
entrega da Meta e, quando a mensagem não chega, **avisa o escritório** e
**reenvia sozinho** quando isso adianta. A equipe também pode **reenviar ou
marcar como resolvida** pela tela **Mensagens**.

## O que o sistema sabe de cada mensagem

| Situação | Quer dizer |
| --- | --- |
| Na fila | Ainda não saiu. |
| Enviado | A Meta aceitou (WhatsApp) ou o servidor de e-mail aceitou. |
| Entregue | A Meta confirmou que chegou ao celular. |
| Lida | A pessoa abriu (só quando ela não desligou a confirmação de leitura). |
| Sem confirmação | WhatsApp aceito há mais de **6 horas** e sem "entregue": celular desligado, sem internet ou sem o aplicativo. A Meta continua tentando. |
| Falhou | O envio falhou, ou a Meta devolveu que não entregou. |

Na auditoria da agenda (Notificações enviadas) a situação aparece embaixo do
status: "lida", "entregue", "sem confirmação" ou "o que fazer".

## Quando falha

O motivo é traduzido e classificado:

| Tipo | Exemplo | O que acontece |
| --- | --- | --- |
| Instabilidade | 131000, 131016, limite da Meta (130429, 131048, 131056) | O sistema **reenvia sozinho em 30 minutos**, uma vez. |
| Limite de engajamento | 131049 | O sistema **reenvia sozinho em 24 horas** (a Meta pede para esperar). |
| Número | 131026 (não tem WhatsApp, aplicativo desatualizado) | Alerta para a equipe: conferir o telefone no cadastro e reenviar, ou ligar. |
| Bloqueou empresas | 131050 | Alerta: por WhatsApp não chega, avisar por outro meio. |
| Plataforma | pagamento (131042, 141006), modelo, conta | Alerta para o escritório **e** registro `ALERTA_PLATAFORMA` no log da BirdJud. |
| E-mail | o e-mail não saiu depois de 3 tentativas | Alerta: conferir o endereço e a conta de envio em Integrações. |

O reenvio automático **nunca** acontece:
- para compromisso que já terá começado;
- para documento (o PDF é gerado de novo na ficha do cliente);
- duas vezes. Se o reenvio automático também falhar, vai para a equipe.

### O alerta: só para quem enviou

O alerta vai **somente para a pessoa que enviou** a mensagem:

| A mensagem saiu por | O alerta vai para |
| --- | --- |
| **Avisar** na agenda | quem clicou |
| marcar o compromisso / incluir participante | quem marcou ou incluiu |
| **Mandar documento** pelo WhatsApp | quem mandou |
| **Reenviar** na tela Mensagens | quem reenviou |
| régua automática (lembretes, resumos) | o **responsável do compromisso**, em nome de quem ela saiu |

Só quando não há ninguém (a pessoa foi desligada, ou o aviso automático não
tem compromisso com responsável), o alerta vai para os administradores. Uma
falha de que ninguém fica sabendo é o que este alerta existe para evitar.

Por onde:
- **e-mail**, sempre, pela conta de e-mail do escritório;
- **WhatsApp**, pelo modelo `birdjud_mensagem_nao_entregue`, quando a pessoa
  marcou que recebe WhatsApp e tem celular no cadastro (e o escritório tem o
  módulo).

O e-mail traz o motivo, o que fazer e o link da tela Mensagens. O WhatsApp
diz o essencial: o que era, para quem, o motivo, e que a tela Mensagens
resolve. Cada falha gera um alerta por canal, nunca repetido. O alerta que
falha não gera outro alerta.

O reenvio automático continua sendo de quem enviou a original. O reenvio
manual passa a ser de quem clicou.

Além do alerta, o **Início** mostra a pendência "N mensagem(ns) podem não
ter chegado" para toda a equipe, com link para a tela.

As falhas de antes desta mudança aparecem na tela e na pendência, mas não
geram alerta.

## A tela Mensagens

Menu **Mensagens**, logo abaixo de Agenda. Ela segue a mesma permissão da
Agenda e tem três partes:

1. **Não entregues**: quem, por onde, o compromisso, o motivo, como foi o
   mesmo aviso pelo outro canal (ex.: "Pelo e-mail: enviado") e quando o
   sistema reenvia sozinho.
2. **Sem confirmação de entrega**.
3. **Resolvidas nos últimos 30 dias**: o que foi feito, quem fez e quando.

Ações:
- **Reenviar**: manda de novo para o contato **atual** do cadastro. Se o
  telefone foi corrigido, sai para o número novo. Quem pediu "parar" no
  WhatsApp não recebe.
- **Marcar como resolvida**: "Avisei por outro meio" ou "Não precisa mais",
  com observação opcional (ex.: "liguei e confirmei a audiência").

A mensagem original nunca é apagada: ela é a prova de que houve a tentativa e
de que a falha foi tratada.

## Requisito na Meta

O webhook do WhatsApp precisa estar assinado no campo **messages**. É o mesmo
campo das respostas dos clientes, e os retornos de entrega (`statuses`)
chegam por ele. Sem retorno nenhum, a seção "sem confirmação" fica vazia de
propósito: só acusa mensagem que saiu antes do último "entregue" que a
plataforma recebeu.

## Código

- `src/lib/entrega.ts`: regras puras (classificação, ordem dos retornos,
  quando reenviar, sem confirmação).
- `src/lib/entrega-do-escritorio.ts`: retorno da Meta, alerta, reenvio,
  resolver e a lista da tela.
- `src/app/api/webhooks/whatsapp/route.ts`: lê `statuses`.
- `src/app/mensagens`, `src/componentes/PainelMensagens.tsx`,
  `src/app/api/mensagens/[id]`.
- Rotina: o `LEMBRAR` de hora em hora chama `conferirEntregas` antes de
  enviar. Não precisa de cron novo.
- Migrações `50_entrega_de_mensagens` e `51_quem_enviou`; testes em `testes/entrega.test.ts`.
