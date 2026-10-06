-- Entrada no contrato de honorarios, e o recibo de pagamento.
--
-- "A vista mais parcelamento" e uma forma de contratacao que o escritorio usa
-- todo dia e que o sistema nao sabia representar: so dava para dizer "a vista"
-- ou "em N vezes". Com a entrada, o contrato de "entrada mais 3x" gera QUATRO
-- cobrancas, nao tres — e a primeira parcela vence no mes seguinte a entrada,
-- porque cobrar as duas no mesmo dia e cobrar duas vezes na assinatura.
--
-- Sem valor, o comportamento e o de antes.
ALTER TABLE "ContratoDeHonorarios"
  ADD COLUMN IF NOT EXISTS "entradaCentavos" INTEGER;
