-- Quem disparou o envio: o alerta de mensagem nao entregue vai so para ela.
ALTER TABLE "Aviso" ADD COLUMN "enviadoPorId" TEXT;
