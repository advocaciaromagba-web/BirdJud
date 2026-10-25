-- Envio automatico por canal, por cliente (25/10/2026, vindo do sistema da
-- Advocacia Roma). O administrador desliga o WhatsApp e/ou o e-mail de um
-- cliente sem apagar o contato: telefone e e-mail seguem no cadastro para
-- ligar e escrever a mao. Padrao ligado: ninguem fica sem aviso por causa
-- desta mudanca.
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "notificarWhatsapp" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "notificarEmail" BOOLEAN NOT NULL DEFAULT true;
-- Quem mexeu por ultimo e quando: deixar de avisar um cliente tem
-- consequencia (prazo, audiencia, cobranca), e a tela mostra.
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "envioAlteradoEm" TIMESTAMP(3);
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "envioAlteradoPor" TEXT;
