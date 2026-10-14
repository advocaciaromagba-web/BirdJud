-- Assinatura anual, com desconto (10%, decidido em 14/10/2026).
--
-- ciclo: MENSAL (o de sempre) | ANUAL. No anual, uma fatura de 12 meses com
-- desconto cobre o escritorio ate "anualAte"; nos meses do meio so sai fatura
-- se houver excedente de consumo.
ALTER TABLE "Assinatura" ADD COLUMN IF NOT EXISTS "ciclo" TEXT NOT NULL DEFAULT 'MENSAL';
ALTER TABLE "Assinatura" ADD COLUMN IF NOT EXISTS "anualAte" TIMESTAMP(3);
