// Registro dos conectores. A tela e as rotas so conhecem este arquivo.
import type { TipoIntegracao } from "../integracao";
import type { Conector } from "./tipos";
import { conectorEmail } from "./email";
import { conectorAsaas } from "./asaas";
import { conectorInfinitePay } from "./infinitepay";
import { conectorAutentique } from "./autentique";
import { conectorCertificado } from "./certificado";
import { conectorGoogle, conectorMicrosoft } from "./pendentes";

/**
 * Os conectores que o ESCRITORIO configura.
 *
 * WHATSAPP_META saiu daqui de proposito: o numero do WhatsApp e UM SO, da
 * plataforma, e a credencial vem do ambiente (ver src/lib/whatsapp.ts). Deixar
 * o campo na tela faria cada escritorio abrir conta na Meta para um numero que
 * ele nao usa — e, pior, acharia que precisa disso para receber os avisos.
 *
 * O tipo continua existindo em TipoIntegracao porque ha linhas gravadas de
 * quando era por escritorio. Elas ficam no banco, inertes.
 */
export const CONECTORES: Partial<Record<TipoIntegracao, Conector>> = {
  SMTP: conectorEmail,
  ASAAS: conectorAsaas,
  INFINITEPAY: conectorInfinitePay,
  AUTENTIQUE: conectorAutentique,
  NFSE_CERT: conectorCertificado,
  MICROSOFT: conectorMicrosoft,
  GOOGLE: conectorGoogle,
};

export function ehTipoDeIntegracao(valor: string): valor is TipoIntegracao {
  return valor in CONECTORES;
}

export * from "./tipos";
