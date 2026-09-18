# Rele do DJEN na Vercel

A API Comunica do CNJ bloqueia por pais: de fora do Brasil a resposta e 403
(CloudFront). A aplicacao inteira nao precisa morar no Brasil por causa disso —
so a chamada ao DJEN precisa. O rele e uma funcao unica na Vercel, fixada na
regiao **gru1 (Sao Paulo)**, que recebe a consulta da aplicacao e repassa ao CNJ.

```
BirdJud (Railway, qualquer regiao)
        │  GET <DJEN_RELE_URL>?numeroOab=...&ufOab=...   Authorization: Bearer <token>
        ▼
Rele (Vercel, gru1 — Sao Paulo)
        │  GET https://comunicaapi.pje.jus.br/api/v1/comunicacao?...   (sem o token)
        ▼
DJEN / API Comunica do CNJ
```

## O que o rele nao e

**Nao e um proxy aberto.** Quem chama nao escolhe o destino: o endereco do CNJ
esta dentro da funcao. So a consulta de comunicacoes passa, e cada parametro
precisa casar com o formato esperado (`numeroOab` so digitos, `ufOab` duas
letras, datas em aaaa-mm-dd, paginacao numerica). Parametro fora da lista e
recusado com 400, nao removido em silencio.

Sem `RELE_TOKEN` configurado, o rele responde 503 e nao chama o CNJ: falha
fechada, para que um deploy pela metade nao vire porta aberta. O token da
plataforma para no rele — o CNJ nunca o ve.

O rele nao guarda nada, nao tem banco e nao conhece escritorio: ele nao sabe de
quem e a OAB que passou por ele. Toda a regra de negocio (OAB monitorada,
deduplicacao, triagem, vinculo) fica na aplicacao.

## Publicar

1. Na Vercel, **Add New > Project**, importe este repositorio.
2. Em **Root Directory**, escolha `rele`. E isso que faz a Vercel publicar so a
   funcao, e nao o sistema inteiro.
3. Framework Preset: **Other**. Nao ha build — a funcao nao tem dependencia.
4. Em **Environment Variables**, crie:

   | Variavel | Valor |
   |---|---|
   | `RELE_TOKEN` | segredo longo, gerado agora (abaixo) |
   | `DJEN_BASE_URL` | so em teste; vazio em producao |

   Gerar o token:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

5. Publique. A regiao ja vem fixada em `gru1` pelo `rele/vercel.json` — confira
   em **Settings > Functions** que e essa a regiao, porque e o unico motivo do
   rele existir.

## Ligar a aplicacao no rele

No ambiente da aplicacao (Railway), configure:

```
DJEN_RELE_URL="https://<projeto>.vercel.app/api/djen"
DJEN_RELE_TOKEN="<o mesmo RELE_TOKEN>"
```

Com as duas preenchidas, toda consulta sai pelo rele e o trabalhador da fila
pode rodar em qualquer regiao. Vazias, a consulta vai direto ao CNJ e so
funciona de dentro do Brasil.

## Conferir que esta de pe

Do seu proprio computador, esteja onde estiver:

```bash
DJEN_RELE_URL="https://<projeto>.vercel.app/api/djen" \
DJEN_RELE_TOKEN="<token>" \
npm run conferir-djen -- 123456 SP
```

O script imprime por onde saiu e, item a item, o que o conversor extraiu de cada
campo. **E assim que se fecha a pendencia do mapeamento de campos** — com o rele
no ar, nao e mais preciso estar no Brasil para conferir.

Mensagens que o cliente traduz, para nao virar "erro 4xx":

- **401** — o `DJEN_RELE_TOKEN` da aplicacao nao e o `RELE_TOKEN` da Vercel.
- **403 mesmo pelo rele** — o projeto nao esta na regiao gru1.

## Custo e limites

Uma captura por escritorio por noite, poucas paginas cada. Isso cabe com folga
no plano gratuito da Vercel. O tempo limite da funcao e 30s (`rele/vercel.json`)
e o do lado da aplicacao e 12s, entao a aplicacao desiste primeiro — o que
importa, porque e ela que segura o trabalho da fila.

## Arquivos

| Arquivo | O que e |
|---|---|
| `rele/api/djen.ts` | A funcao: token, conferencia dos parametros e repasse |
| `rele/vercel.json` | Fixa a regiao gru1 e o tempo limite |
| `rele/package.json` | Sem dependencia, de proposito |
| `src/lib/djen.ts` | Decide entre rele e chamada direta, e traduz as recusas |
| `testes/rele.test.ts` | 15 casos: token, parametro estranho, repasse e mensagens |

O `rele/` nao importa nada de `src/`: ele e implantado sozinho e vale como
fronteira propria. A lista de parametros aparece nos dois lados de proposito.
