-- Vigencia da despesa fixa: de quando ate quando ela existe.
--
-- Sem isto, a despesa fixa e gerada para sempre. O escritorio devolve a sala
-- em junho, desliga a despesa so em setembro, e nesse meio tempo recebeu tres
-- contas de aluguel de uma sala que nao tem mais — e pagou pelo menos uma por
-- distracao. O contrato que comecou em marco, cadastrado em maio, tambem nao
-- deve gerar janeiro e fevereiro.
--
-- Sem valor, o comportamento e o de hoje: vale sempre. Nenhuma despesa ja
-- cadastrada muda de ideia por causa desta migracao.
ALTER TABLE "DespesaFixa" ADD COLUMN IF NOT EXISTS "inicioEm" DATE;
ALTER TABLE "DespesaFixa" ADD COLUMN IF NOT EXISTS "fimEm" DATE;
ALTER TABLE "DespesaFixa" ADD COLUMN IF NOT EXISTS "observacoes" TEXT;
