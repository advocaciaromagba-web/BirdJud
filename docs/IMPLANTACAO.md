# Implantacao pela plataforma

A Blackbird monta a conta do escritorio e a entrega pronta, testada. O
escritorio recebe o convite e encontra o sistema funcionando, sem precisar de
assistencia na implantacao. O caminho de autoatendimento (cadastro + primeiros
passos) continua existindo; os dois produzem o MESMO escritorio, porque usam as
mesmas funcoes.

## O caminho

1. **Console → Implantar escritorio** (`/plataforma/novo`): nome (o endereco
   sai sozinho), razao social, CNPJ, telefone, cidade, plano, faixa, valor
   fechado (em branco = tabela, mostrada ao vivo) e dias de teste; o
   administrador com e-mail, OAB e celular.
2. **Implantacao** (`/plataforma/{id}/implantacao`), em seis secoes:
   dados e cores; equipe; OABs no DJEN; integracoes; o roteiro do escritorio;
   entrega.
3. **Entregar ao escritorio**: convite para quem ainda nao entrou,
   administrador primeiro. Sem remetente de e-mail na plataforma, o link
   aparece na tela, uma vez, para repassar por outro meio.

## O que acontece sozinho

- advogado (inclusive o administrador) cadastrado com OAB, em escritorio com
  DJEN: a OAB entra no monitoramento;
- celular com "avisos pelo WhatsApp": a pessoa ja sai recebendo;
- integracao (e-mail, Asaas, InfinitePay, Autentique, certificado A1): testada
  no servico de verdade antes de guardar; falha fica marcada com o motivo.
  O certificado sobe como arquivo .pfx, convertido no navegador;
- o roteiro do escritorio (Primeiros passos) mede tudo do mesmo jeito — o
  operador nao marca nada como feito, ele faz.

## O que a plataforma NAO faz, de proposito

| | por que |
| --- | --- |
| senha de entrar de cada pessoa | cada um escolhe a sua pelo convite |
| senha de administracao | e a segunda chave do escritorio (financeiro, certificado); quem a conhece abre tudo. E o primeiro passo dele, um minuto |
| aceite dos termos, contrato e LGPD | e contrato: quem aceita e o escritorio. O administrador ve a tela de aceite no primeiro acesso |
| OneDrive / Google Drive | exigem entrar na conta do escritorio; e um clique dele em Integracoes |
| logotipo e modelos de documento | arquivos do escritorio; ele envia em Configuracoes e Modelos |

## O aceite dos termos

Antes, o aceite so acontecia na tela de cadastro. Agora toda tela do
escritorio confere: sem o aceite da versao vigente, abre `/aceite`. O
administrador aceita (nome, data, hora, IP e navegador gravados); os demais
veem o recado e esperam. Escritorio que se cadastrou sozinho ja aceitou e nunca
ve a tela — a nao ser quando um documento mudar de versao.

**Efeito em producao:** escritorio criado por script, sem passar pelo
cadastro, vai ver a tela de aceite no proximo acesso do administrador.

## Rastro

Toda acao do operador sobre um escritorio vira `AcessoSuporte` (quem, quando,
o que). `Escritorio.implantadoPor`, `implantadoEm` e `entregueEm` (migracao
48) dizem quem montou e quando foi entregue; o painel lista as implantacoes
abertas.

## Onde esta no codigo

- `src/lib/implantacao.ts` — implantar, incluir na equipe, entregar
- funcoes compartilhadas com as telas do escritorio: `nascimento.ts`,
  `equipe.ts`, `dados-do-escritorio.ts`, `oabs.ts`, `conectores/conectar.ts`
- `src/app/plataforma/novo`, `src/app/plataforma/[id]/implantacao`,
  `src/app/api/plataforma/escritorios/**`
- `src/app/aceite`, `src/app/api/aceite`
- testes: `testes/implantacao.test.ts`
