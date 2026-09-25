# A marca no sistema

Duas marcas convivem aqui, e confundi-las e o erro mais caro do produto:

- a **marca da plataforma** (BirdJud, by Blackbird) fala com quem contrata o
  sistema: capa, cadastro e painel da plataforma;
- a **marca do escritorio** manda dentro do subdominio dele. Quem entra em
  `escritorio.birdjud.com.br` e cliente ou equipe daquele escritorio, e nao
  deve ver a nossa marca ali.

Por isso `MarcaBirdJud` nao entra em `Estrutura`, que e a casca das telas de
escritorio.

## Paleta

| cor | valor | onde |
| --- | --- | --- |
| Azul profundo | `#0B1F3B` | cor primaria da plataforma, faixa escura, botao principal |
| Ouro elegante | `#D4AF7C` | selo, filete, sobretitulo, regua — nunca superficie grande |
| Grafite | `#1F1F1F` | `--grafite`, texto denso |
| Cinza prata | `#A7A9AC` | `--prata`, apoio |
| Off white | `#F6F7F8` | `--off-white`, fundo de toda a aplicacao |

As duas primeiras chegam no `<body>` como `--marca-primaria` e
`--marca-secundaria` e **sao trocadas pelas cores do escritorio** em cada
subdominio. As tres ultimas nao mudam: sao o que sustenta a leitura sob
qualquer marca.

O ouro e de realce. Ouro cobrindo area deixa de ser destaque e vira ruido, e
em fundo claro nao tem contraste para texto corrido — por isso `globals.css`
nao tem botao nem fundo em ouro, so `.destaque`, `.filete-destaque` e
`.regua-destaque`.

## Tipografia

- **Playfair Display** em `h1`/`h2` e no nome da marca. E identidade, aparece
  pouco;
- **Inter** em todo o resto — formulario, tabela, numero de processo;
- **Source Serif** em `.leitura`, reservada a texto de peca e de publicacao.

As tres sao baixadas no build e servidas do nosso dominio: nenhuma requisicao
do navegador do escritorio sai para um terceiro, o que tambem mantem a CSP
com `font-src 'self'`.

## Arquivos

Em `public/marca/`:

| arquivo | uso |
| --- | --- |
| `horizontal.png` | lockup completo, com chamada e assinatura, sobre fundo claro |
| `vertical.png` | o mesmo, empilhado |
| `vertical-claro.png` | versao em ouro e creme, para a faixa escura |
| `simbolo.png` | so o passaro com a balanca |
| `icone-192.png`, `icone-512.png` | icone de aplicativo |
| `quadrado-escuro.jpg` | imagem de compartilhamento (link em rede social) |

`src/app/icon.png` e `src/app/apple-icon.png` sao a convencao do Next para o
favicon e o icone do iPhone; o Next os serve sozinho.

A versao clara foi gerada a partir da arte em fundo escuro, recortando o fundo
por luminancia. Sobre a faixa azul, o "BIRD" em azul profundo do lockup padrao
sumiria no fundo.
