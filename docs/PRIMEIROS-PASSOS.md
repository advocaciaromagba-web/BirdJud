# Primeiros passos

O roteiro de configuracao do escritorio que acabou de chegar. Antes dele,
quem se cadastrava caia num painel com todos os numeros em zero e tinha de
adivinhar por onde comecar — e o que nao se configura no primeiro dia
costuma nunca ser configurado.

## Onde aparece

| lugar | para quem | quando |
| --- | --- | --- |
| tela inicial, cartao grande de boas-vindas no lugar dos numeros | administrador | nenhum passo feito ainda |
| tela inicial, cartao com o proximo passo, acima dos numeros | administrador | ate tudo estar feito ou pulado, ou ate ele esconder |
| `/primeiros-passos`, o roteiro completo | administrador (quem nao e ve um recado) | sempre; no menu, abaixo da linha |
| tela "Escritorio criado", logo apos o cadastro | quem se cadastrou | uma vez, explicando o que vem |

O cartao mostra **um** passo: o proximo. A lista inteira na primeira tela
assusta, e quem se assusta fecha.

## As tres fases

1. **O escritorio** (essencial, menos de dez minutos): senha de
   administracao; CNPJ e telefone de atendimento; advogados com OAB.
2. **Ligar o sistema ao mundo**: OAB monitorada no DJEN, e-mail, quem
   recebe pelo WhatsApp, conta de cobranca, assinatura eletronica, nuvem,
   nota fiscal e os modelos do escritorio.
3. **Comecar a usar**: primeiro cliente, primeiro processo, primeira
   audiencia ou reuniao.

Cada passo diz **por que importa** (o que deixa de acontecer sem ele) antes
de dizer **como fazer**, com o tempo estimado e o botao para a tela certa.
Quem entende o motivo configura direito; quem so segue a ordem pula o que
parece burocracia.

## As regras

**O passo se marca sozinho.** Nada de "ja fiz" clicado: o roteiro olha o
escritorio (tem senha? tem OAB? o e-mail respondeu ao teste?). Integracao
gravada mas com erro conta como pendente. Checklist que a pessoa marca mente
na primeira vez que ela marca para tirar da frente.

**So aparece o que o plano tem.** Sem o modulo de cobrancas, nao ha passo
de Asaas.

**Essencial nao se pula** — nem pela tela nem pela API (400). O resto pode
ser marcado "Nao vamos usar agora", com o nome de quem decidiu, e voltar ao
roteiro quando quiser. Pulado sai da conta do progresso.

**Nuvem sem aplicativo da plataforma** aparece como "em breve" e nao conta:
o escritorio nao tem como fazer o que depende da Blackbird.

**Com o cartao na tela, as pendencias de configuracao saem do "Precisa de
voce"** (OAB, e-mail, CNPJ, cadastro fiscal), para nao repetir. Prazo,
integracao com erro e aviso que falhou continuam: sao do dia a dia.

## O que fica gravado

`Escritorio.primeirosPassos` (migracao 47) guarda so o que a pessoa
**decidiu**: os passos pulados (quando e por quem) e se escondeu o cartao da
tela inicial. O que esta feito nunca e gravado — e medido a cada abertura.

## Acrescentar um passo

Uma entrada em `DEFINICOES` (`src/lib/primeiros-passos.ts`): chave, fase,
titulo, porque, como, destino, minutos, modulos exigidos e a funcao `feito`
sobre os fatos. Se o passo precisa de um fato novo, ele entra em `Fatos` e
em `fatosDoEscritorio`. Os testes conferem que todo passo explica o porque e
o como.

## Onde esta no codigo

- `src/lib/primeiros-passos.ts` — o roteiro, funcao pura
- `src/lib/primeiros-passos-do-escritorio.ts` — fatos do banco, pular, retomar, esconder
- `src/app/primeiros-passos/page.tsx` e `src/componentes/RoteiroDePrimeirosPassos.tsx`
- `src/componentes/CartaoPrimeirosPassos.tsx` — o cartao da tela inicial
- `src/app/api/primeiros-passos/route.ts`
- `testes/primeiros-passos.test.ts`
