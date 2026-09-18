// Registro dos conectores. A tela e as rotas so conhecem este arquivo.
import type { TipoIntegracao } from "../integracao";
import type { Conector } from "./tipos";
import { conectorEmail } from "./email";
import { conectorAsaas } from "./asaas";
import { conectorAutentique } from "./autentique";
import { conectorWhatsapp } from "./whatsapp";
import { conectorCertificado } from "./certificado";
import { conectorGoogle, conectorMicrosoft } from "./pendentes";

export const CONECTORES: Record<TipoIntegracao, Conector> = {
  SMTP: conectorEmail,
  ASAAS: conectorAsaas,
  AUTENTIQUE: conectorAutentique,
  WHATSAPP_META: conectorWhatsapp,
  NFSE_CERT: conectorCertificado,
  MICROSOFT: conectorMicrosoft,
  GOOGLE: conectorGoogle,
};

export function ehTipoDeIntegracao(valor: string): valor is TipoIntegracao {
  return valor in CONECTORES;
}

export * from "./tipos";
