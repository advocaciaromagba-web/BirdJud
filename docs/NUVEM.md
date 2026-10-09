# Nuvem do escritorio: OneDrive ou Google Drive

Cada escritorio conecta a **propria** conta, OneDrive ou Google Drive, a
escolha dele. Uma de cada vez: os documentos de um cliente ficam em um lugar
so. A Blackbird registra **um** aplicativo em cada provedor, uma vez; o
escritorio so entra na conta dele e autoriza.

## O que acontece sozinho

Depois do clique em "Entrar com a conta Microsoft" (ou Google), em
Integracoes:

```
BirdJud/                              criada na hora da conexao
  Clientes/
    Maria Silva - 123.456.789-00/     uma por cliente, pela fila
      2026-10-09 - procuracao.pdf     copia do que foi anexado ao cliente
```

- conectar cria `BirdJud/Clientes` e agenda a rotina `ORGANIZAR_NUVEM`, que
  cria a pasta de cada cliente que ja existe;
- cliente novo e documento anexado a cliente cutucam a mesma rotina;
- a rotina faz lotes (100 pastas, 30 copias) e se reagenda se sobrar;
- pasta apagada na nuvem e recriada no proximo uso; `Clientes` apagada
  inteira tambem;
- reconectar acha `BirdJud` pelo nome e nao duplica;
- "Abrir pasta no OneDrive" na ficha do cliente cria a pasta na hora se ela
  ainda nao existir.

A copia e de mao unica e nunca derruba nada: o documento fica no sistema de
qualquer jeito. Desconectar apaga o token e o mapa de pastas; **o que ja esta
na nuvem fica na conta do escritorio**.

## Seguranca do ida-e-volta

O endereco de retorno e um so, no dominio da plataforma — e o que fica
registrado no aplicativo. O caminho:

1. `/api/nuvem/conectar/{microsoft|google}` no subdominio do escritorio:
   exige administrador e modulo NUVEM, assina um bilhete (escritorio,
   usuario, slug, provedor, nonce, validade de 15 min) e guarda o nonce num
   cookie do subdominio;
2. o provedor devolve em `https://birdjud.com.br/api/nuvem/retorno/...`, que
   so confere a assinatura e repassa ao subdominio do bilhete;
3. `/api/nuvem/concluir/...` no subdominio confere tudo de novo: assinatura,
   prazo, mesmo escritorio, mesma pessoa, administrador e o nonce do cookie.
   So entao troca o codigo.

Bilhete adulterado para em (2). Codigo levado para outro navegador para em
(3), por falta do cookie. O slug do bilhete so aceita letras, numeros e
hifen: nao vira redirecionamento para fora.

O token de renovacao fica cifrado na `Integracao` do escritorio. Quando a
Microsoft manda um novo, ele e guardado na hora. Token revogado marca a
integracao com ERRO e a tela mostra "Conectar de novo".

## Registrar o aplicativo — Microsoft (uma vez, pela Blackbird)

1. portal.azure.com → **Microsoft Entra ID** → **Registros de aplicativo** →
   **Novo registro**;
2. nome `BirdJud`; tipos de conta: **Contas em qualquer diretorio
   organizacional e contas pessoais da Microsoft**;
3. URI de redirecionamento, plataforma **Web**:
   `https://birdjud.com.br/api/nuvem/retorno/microsoft`;
4. **Certificados e segredos** → **Novo segredo do cliente**, validade 24
   meses. Copie o **Valor** (nao o ID do segredo). Anote a data: vence, e
   tem de ser renovado antes;
5. **Permissoes de API** → Microsoft Graph → **Delegadas**: `Files.ReadWrite`,
   `offline_access`, `User.Read`;
6. na **Visao geral**, copie o **ID do aplicativo (cliente)**.

Variaveis, na **aplicacao E no trabalhador** (a rotina roda no trabalhador):

```
MICROSOFT_CLIENT_ID=<ID do aplicativo>
MICROSOFT_CLIENT_SECRET=<Valor do segredo>
```

Conta de trabalho (Microsoft 365) de empresa que bloqueia consentimento de
usuario vai pedir aprovacao do administrador dela. A verificacao de editor
(Publisher verification, no mesmo portal) tira o selo "nao verificado".

## Registrar o aplicativo — Google (uma vez, pela Blackbird)

1. console.cloud.google.com → projeto novo `BirdJud`;
2. **APIs e servicos** → **Biblioteca** → ativar **Google Drive API**;
3. **Tela de consentimento OAuth**: tipo **Externo**; nome `BirdJud`;
   dominio autorizado `birdjud.com.br`; escopos `openid`, `email` e
   `.../auth/drive.file`;
4. **Publicar o aplicativo** (status "Em producao"). Em modo de teste o
   Google so deixa 100 contas cadastradas a mao **e vence o acesso em 7
   dias** — o escritorio seria desconectado toda semana;
5. **Credenciais** → **Criar credenciais** → **ID do cliente OAuth** → tipo
   **Aplicativo da Web**; URI de redirecionamento autorizado:
   `https://birdjud.com.br/api/nuvem/retorno/google`.

Variaveis, na **aplicacao E no trabalhador**:

```
GOOGLE_CLIENT_ID=<ID do cliente>
GOOGLE_CLIENT_SECRET=<Chave secreta do cliente>
```

`drive.file` e de proposito: o sistema ve so o que ele criou. O escopo amplo
(`drive`) exige auditoria de seguranca paga do Google e daria leitura do
Drive inteiro do escritorio. Consequencia pratica: arquivo que o escritorio
poe na pasta pelo proprio Drive aparece para ele, mas o sistema nao le de
volta.

## Sem as variaveis

O cartao mostra "Aguardando a plataforma liberar a conexao" e nada mais muda.
A conferencia de partida avisa (nunca derruba): aplicativo nao registrado, ou
so metade do par definida.

## Onde esta no codigo

- `src/lib/nuvem/` — bilhete assinado, OneDrive, Google Drive, enderecos
- `src/lib/nuvem-do-escritorio.ts` — conectar, estrutura, pasta por cliente, copia
- `src/lib/avisar-nuvem.ts` — cutuca a rotina sem duplicar na fila
- `src/app/api/nuvem/` — conectar, retorno, concluir, organizar
- `src/app/api/clientes/[id]/nuvem` — abrir a pasta do cliente
- testes: `testes/nuvem.test.ts`, com OneDrive e Google Drive falsos em memoria
