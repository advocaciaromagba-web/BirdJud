# Roteiro de lancamento

O que falta para abrir o BirdJud a escritorios de fora, na ordem. Atualizar
esta pagina a cada item fechado (data e quem fez).

## Bloqueia o lancamento

| # | Item | Quem | Estado |
|---|---|---|---|
| 1 | Trocar as credenciais vazadas no incidente do Railway de 21/10 nos paineis de origem (R2, Asaas, Meta, Resend, Gmail, OpenAI, Anthropic, reles na Vercel) e depois as internas (`SEGREDO_CHAVE` com `npm run trocar-segredo-chave`, `NEXTAUTH_SECRET`, senhas do banco). Roteiro em `docs/SEGURANCA.md` | operadora, depois o sistema | pendente |
| 2 | Nota fiscal da assinatura: emitir a nota de teste, conferir o DANFSe, passar o emissor para Producao e ligar a emissao automatica (console > Notas fiscais) | operadora | feito em 23/10: nota 2 em homologacao conferida, codigo de tributacao corrigido para 010501 (licenciamento de software), emissor em Producao |
| 3 | Causa da rotina que falhou em 23/10 (console > painel > "Rotinas com falha") | sistema | aguardando o bloco no ar |

## Antes de vender, sem bloquear

| # | Item | Estado |
|---|---|---|
| 4 | Rotacionar os tokens que passaram pelo chat ou por imagem (Railway, Bitwarden, R2) e guardar os novos no Bitwarden | pendente |
| 5 | Fatura real de R$ 5 paga pelo Pix num escritorio de teste: prova fatura, e-mail, baixa e nota de ponta a ponta | pendente |
| 6 | Voltar o valor da mensalidade da Advocacia Roma para a tabela ou cortesia (ficou R$ 367,60 fixo no teste) | pendente |
| 7 | Um escritorio de fora usando por uma semana, com o suporte acompanhando | pendente |

## Pronto

- Sistema no ar; backup diario cifrado fora do Railway e conferido; vigia externo com e-mail e issue (`docs/BACKUP.md`, `docs/VIGIA-EXTERNO.md`).
- Planos, cadastro com 14 dias de teste, cobranca por boleto, Pix e cartao, baixa automatica (`docs/PLANOS.md`).
- Documentos juridicos no site, dados da Blackbird no rodape, WhatsApp de contato.
- Variaveis de todos os servicos guardadas no Bitwarden (colecao "Variaveis dos sistemas (Railway)").
- Roteiro para acompanhar as novidades do sistema da Advocacia Roma (`docs/ESPELHO-DA-ROMA.md`).
- Nota fiscal do escritorio para os clientes dele, provada em producao.
