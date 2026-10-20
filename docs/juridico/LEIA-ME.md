# Documentos juridicos do BirdJud

> **Versao 2026-10-20**: acentuacao corrigida em todos os documentos e o
> Resend incluido entre os suboperadores. O texto de 16/10 foi revisado por
> Jose Luciano da Costa Roma, que e tambem o encarregado de dados (LGPD) da
> plataforma. Contratada: BLACKBIRD SOLUCOES
> ESTRATEGICAS LTDA, CNPJ 30.044.017/0001-01, Guariba/SP. Foro de Guariba/SP,
> reajuste pelo IPCA, contato e suporte em contato@blackbirdsolucoes.com.br.

| Arquivo | Para que serve |
| --- | --- |
| `TERMOS-DE-USO.md` | Regras de uso da plataforma, aceitas no cadastro |
| `CONTRATO-SAAS.md` | Contrato de licenca e prestacao de servico |
| `ACORDO-LGPD.md` | Tratamento de dados: plataforma como operadora |
| `SLA.md` | Disponibilidade, suporte e consequencias |
| `POLITICA-DE-PRIVACIDADE.md` | Para o titular final (cliente do escritorio) |

## Versao dos documentos

A versao vigente fica em `src/lib/juridico.ts`, em `VERSAO_DOS_DOCUMENTOS`.
Cada aceite grava a versao aceita, entao mudar o texto **exige** subir a versao —
senao o registro de aceite passa a apontar para um texto que o escritorio nunca
leu.

## Decisoes registradas (16/10/2026)

- hospedagem mantida em Amsterda (UE), com a transferencia internacional
  declarada no Acordo LGPD (art. 33, clausulas-padrao da ANPD);
- teste de 14 dias, retencao de 90 dias apos o encerramento, registro de
  acesso de suporte guardado por 12 meses;
- plano anual com 10% de desconto; tarifa do cartao repassada; anual no cartao
  ate 6x.

Mudou o texto? Suba `VERSAO_DOS_DOCUMENTOS` em `src/lib/juridico.ts`: cada
escritorio aceita a versao nova no proximo acesso.
