-- Aviso de tarefa em duas entregas por dia: a hora a partir da qual o aviso
-- pode sair. Nulo = sai na hora (tudo o que ja existia segue como antes).
ALTER TABLE "Aviso" ADD COLUMN "liberarEm" TIMESTAMP(3);
