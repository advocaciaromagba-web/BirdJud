# Documentos juridicos do BirdJud

> **MINUTAS.** Os arquivos desta pasta sao rascunhos tecnicos, escritos a partir
> do que o sistema realmente faz. Eles **precisam de revisao por advogado** antes
> de ir para qualquer cliente. Nao sao parecer juridico.

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

## O que ainda depende de decisao sua

- razao social, CNPJ e endereco da empresa que vende o BirdJud;
- foro eleito;
- valores e reajuste (a tabela de precos em `src/lib/precos.ts` e provisoria);
- prazo de retencao apos encerramento (hoje: 90 dias, em `src/lib/juridico.ts`);
- se o suporte tera telefone, e em que horario.
