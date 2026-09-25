// Como cada modulo se chama na tela.
//
// Um lugar so: a mesma palavra na vitrine, no plano do escritorio e no painel
// da plataforma. Enum do banco nao e nome de produto.
import type { Modulo } from "./catalogo";

export const ROTULO_DO_MODULO: Record<Modulo, string> = {
  NUCLEO: "Sistema (clientes, processos, agenda)",
  PUBLICACOES_DJEN: "Publicacoes do DJEN",
  NUVEM: "Arquivos do escritorio",
  EMAIL: "Aviso por e-mail",
  COBRANCAS: "Cobrancas",
  FINANCEIRO: "Financeiro",
  NFSE: "Nota fiscal de servico",
  IA: "Inteligencia artificial",
  WHATSAPP: "Aviso por WhatsApp",
  ASSINATURA: "Assinatura eletronica",
};
