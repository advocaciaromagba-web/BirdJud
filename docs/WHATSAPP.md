# WhatsApp (Cloud API da Meta)

O escritorio avisa a propria equipe pelo **numero dele**, nao por um numero da
plataforma. A Meta exige que a mensagem saia de quem tem relacao com o
destinatario, e a nota de qualidade do numero seria dividida entre escritorios
que nao se conhecem.

## O fato que manda em tudo

Fora da janela de 24 horas aberta por uma mensagem **do destinatario**, a Meta
so entrega **modelo aprovado por ela**. Aviso do sistema e sempre proativo —
ninguem escreveu para o escritorio pedindo o resumo do dia. Por isso o modulo
nao tem funcao de "mandar texto livre": ela funcionaria nos testes e falharia
em producao, e o escritorio descobriria isso no dia do prazo.

**Sem os modelos aprovados na conta do escritorio, nao sai aviso nenhum pelo
WhatsApp.** O e-mail continua saindo normalmente.

## Os modelos para aprovar

No **WhatsApp Manager > Modelos de mensagem > Criar modelo**, categoria
**Utilidade** (nao Marketing: aviso de prazo e utilidade, e a taxa e menor),
idioma **Portugues (BR)**.

### 1. `birdjud_resumo_publicacoes`

Corpo, exatamente:

```
{{1}}: voce tem {{2}} publicacao(oes) nova(s), sendo {{3}} urgente(s). Abra o sistema para ler o texto completo. O prazo indicado e leitura automatica e serve como alerta — confira sempre nos autos.
```

| Parametro | O que e | Exemplo |
|---|---|---|
| `{{1}}` | nome do escritorio | Advocacia Roma |
| `{{2}}` | quantidade de publicacoes | 7 |
| `{{3}}` | quantas sao urgentes | 2 |

### 2. `birdjud_lembrete_compromisso`

Corpo, exatamente:

```
{{1}}: lembrete de {{2}} em {{3}}. {{4}}. Confira a agenda no sistema.
```

| Parametro | O que e | Exemplo |
|---|---|---|
| `{{1}}` | nome do escritorio | Advocacia Roma |
| `{{2}}` | titulo do compromisso | Audiencia de instrucao |
| `{{3}}` | data e hora | 20/10/2026 14:30 |
| `{{4}}` | local, ou o processo | Forum de Salvador, sala 3 |

**A ordem dos parametros e um contrato.** Trocar `{{2}}` por `{{3}}` de um lado
sem trocar do outro faz o sistema mandar a hora no lugar do titulo, e ninguem
percebe ate alguem receber. Os textos acima estao tambem em
`src/lib/modelos-whatsapp.ts`, e ha um teste que confere se cada `{{n}}` do
texto tem significado declarado.

## Conectar

1. Meta: **WhatsApp > Configuracao da API** — anote o **ID do numero de
   telefone** e gere um **token de acesso permanente** (token temporario de 24h
   serve so para experimentar).
2. No BirdJud, **Integracoes > WhatsApp (Cloud API)**: ID do numero e token. O
   teste de conexao mostra o nome verificado e a nota de qualidade do numero.
3. Cada pessoa, em **Minha conta**, informa o telefone e marca "Receber tambem
   no WhatsApp". Telefone que o sistema nao consegue ler e recusado ali, com a
   pessoa olhando para o campo — melhor que virar aviso perdido.

## Como o envio se comporta

- Um aviso por canal: quem tem e-mail e WhatsApp recebe os dois, e ligar o
  WhatsApp hoje **nao** reenvia o e-mail de ontem (a chave de idempotencia e
  por canal).
- Erro que a Meta ja disse ser definitivo — modelo que nao existe, numero sem
  WhatsApp, token revogado — para na primeira tentativa. Insistir tres vezes no
  mesmo "nao" atrasa os avisos que dariam certo e gasta a nota do numero.
- Limite de taxa e erro do servidor da Meta contam tentativa e voltam na
  proxima rodada.
- Numero nao conectado nao e falha: os avisos ficam pendentes e saem no dia em
  que o escritorio conectar.

## Custo

A Meta cobra por conversa iniciada pelo escritorio, na categoria do modelo
(utilidade e mais barata que marketing). Isso e entre o escritorio e a Meta. A
plataforma mede `WHATSAPP_MSG` para a franquia do modulo e para o excedente da
fatura — sao duas contas diferentes, e a nossa nao substitui a da Meta.

## Para testar sem a Meta

`META_BASE_URL` aponta a API para outro endereco. E assim que a bateria roda
(um HTTP local no lugar da Meta) e como se confere o formato do que sai sem
mandar mensagem de verdade. Em producao, vazia.
