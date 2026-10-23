// Como cada modulo se chama na tela.
//
// Um lugar so: a mesma palavra na vitrine, no plano do escritorio e no painel
// da plataforma. Enum do banco nao e nome de produto.
import type { Modulo } from "./catalogo";

export const ROTULO_DO_MODULO: Record<Modulo, string> = {
  NUCLEO: "Sistema (clientes, processos, agenda)",
  PUBLICACOES_DJEN: "Publicações do DJEN",
  NUVEM: "Arquivos do escritório",
  EMAIL: "Aviso por e-mail",
  COBRANCAS: "Cobranças",
  FINANCEIRO: "Financeiro",
  NFSE: "Nota fiscal de serviço",
  IA: "Inteligência artificial",
  WHATSAPP: "Aviso por WhatsApp",
  ASSINATURA: "Assinatura eletrônica",
};
