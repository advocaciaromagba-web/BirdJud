# Honorarios

O contrato de honorarios mora na **ficha do cliente**, junto da procuracao, da
declaracao e do contrato em documento. Nao ha mais aba "Honorarios" no menu:
`/honorarios` redireciona para Clientes.

## Do contrato ao financeiro

1. Na ficha do cliente, secao **Honorarios**: valor, forma, parcelas e
   primeiro vencimento (ou percentual de exito). Aparece com o modulo
   COBRANCAS ou FINANCEIRO.
2. Gravado, cada parcela vira uma **receita a receber** no financeiro
   (`Lancamento` com `pagoEm` nulo, categoria HONORARIOS, competencia do mes
   do vencimento), ligada ao contrato por `contratoId` + `parcelaNumero`
   (unico). E o `preverRecebimentos` em `src/lib/honorarios-do-escritorio.ts`.
3. A baixa acontece **na mesma linha**, nunca numa segunda:
   - **cobranca paga** (Asaas/InfinitePay): `darBaixa` acha a parcela prevista
     e preenche `pagoEm`, valor e `cobrancaId`;
   - **conferencia do extrato** (Pix ou transferencia direto na conta): a
     parcela entra na lista de candidatas pelo nome do cliente e pelo valor, e
     o botao **Dar baixa na parcela** quita a parcela. Valor diferente e
     recusado — lanca-se avulso e ajusta-se a parcela.

Parcela com cobranca emitida nao entra como candidata da conferencia: quem
casa com o pagamento dela e a propria cobranca.

## Editar e encerrar

- Editar o contrato atualiza valor e data das parcelas **a receber**. Parcela
  recebida nunca e mexida.
- Parcela que sai do plano (menos parcelas, contrato encerrado) sai do
  financeiro, **menos** se ja tiver cobranca emitida — boleto na rua continua
  previsto ate alguem resolver.
- Percentual de exito nao entra no financeiro: o valor so existe quando a acao
  termina.

## Rotina

`EMITIR_HONORARIOS` (diaria) chama `preverTodosOsRecebimentos` antes de
emitir: contratos gravados antes desta mudanca ganham as parcelas a receber.
Idempotente. Testes em `testes/honorarios-no-financeiro.test.ts`.
