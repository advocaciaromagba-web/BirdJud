# Roteiro de lancamento

O que falta para abrir o BirdJud a escritorios de fora, na ordem. Atualizar
esta pagina a cada item fechado (data e quem fez).

## Bloqueia o lancamento

| # | Item | Quem | Estado |
|---|---|---|---|
| 1 | Trocar as credenciais vazadas no incidente do Railway de 21/10 nos paineis de origem (R2, Asaas, Meta, Resend, Gmail, OpenAI, Anthropic, reles na Vercel) e depois as internas (`SEGREDO_CHAVE` com `npm run trocar-segredo-chave`, `NEXTAUTH_SECRET`, senhas do banco). Roteiro em `docs/SEGURANCA.md` | operadora, depois o sistema | pendente |
| 2 | Nota fiscal da assinatura: emitir a nota de teste, conferir o DANFSe, passar o emissor para Producao e ligar a emissao automatica (console > Notas fiscais) | operadora | feito em 23/10: nota 2 em homologacao conferida, codigo de tributacao corrigido para 010501 (licenciamento de software), emissor em Producao |
| 3 | Causa da rotina que falhou em 23/10 (console > painel > "Rotinas com falha") | sistema | feito em 24/10: era a NFS-e recusada por cNBS (corrigida em a0a7537); trabalhador sem erro nas 24 h seguintes, rotinas de 24/10 rodaram |

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
- Console do operador (23/10): tabela de precos editavel com reajuste, ciclo trimestral, cupons, isencao por prazo, reajuste anual dos contratos com aviso por e-mail, exclusao definitiva e entrada no escritorio como suporte.
- Revisão de código antes do lançamento (24/10): 10 achados, todos corrigidos e com teste — sessão de suporte sem criar conta nem definir a senha de administração, cupom contado em meses de fatura e proporcional no trimestral e no anual, exclusão que cancela o boleto no Asaas antes de apagar, editor de preços que aceita ponto e vírgula.
- Página inicial: "Uma plataforma feita por advogados que entendem a dor dos advogados"; cabeçalho do celular com Entrar e Teste grátis.
- Chaves trocadas depois do incidente do Railway: `NEXTAUTH_SECRET` e `BACKUP_CHAVE` (23/10, a antiga guardada no Bitwarden para abrir os backups anteriores).
