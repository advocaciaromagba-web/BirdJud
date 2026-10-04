-- Retrato da baixa na propria fatura.
--
-- A conta Asaas da Blackbird atende varios sistemas, e o evento de pagamento
-- chega igual para todos eles. Guardar aqui o sistema, a referencia, o
-- escritorio que pagou, o valor e a forma e o que permite responder "de quem
-- foi este dinheiro, e de qual sistema?" depois que o log do provedor expira.
ALTER TABLE "Fatura" ADD COLUMN IF NOT EXISTS "baixa" JSONB;
