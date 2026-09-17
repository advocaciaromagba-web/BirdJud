// Credenciais por escritorio — substitui o process.env.X dos sistemas de
// escritorio unico. Toda integracao (WhatsApp, Asaas, AASP, Autentique, SMTP,
// OneDrive, Google, e-CNPJ) e lida por aqui.
import { comEscritorio, semEscritorio } from "./prisma";
import { cifrar, decifrar } from "./segredo";

export type TipoIntegracao =
  | "WHATSAPP_META"
  | "ASAAS"
  | "AASP"
  | "AUTENTIQUE"
  | "SMTP"
  | "MICROSOFT"
  | "GOOGLE"
  | "NFSE_CERT";

export class IntegracaoAusente extends Error {
  constructor(tipo: TipoIntegracao) {
    super(`Integracao ${tipo} nao conectada para este escritorio.`);
    this.name = "IntegracaoAusente";
  }
}

export async function obterIntegracao<T = Record<string, unknown>>(
  escritorioId: string,
  tipo: TipoIntegracao
): Promise<T> {
  const registro = await comEscritorio(escritorioId, (db) =>
    db.integracao.findFirst({ where: { tipo } })
  );
  if (!registro || registro.status === "ERRO") throw new IntegracaoAusente(tipo);
  return decifrar<T>(registro.dados);
}

export async function salvarIntegracao(
  escritorioId: string,
  tipo: TipoIntegracao,
  dados: Record<string, unknown>,
  status: "PENDENTE" | "OK" | "ERRO" = "PENDENTE"
) {
  const pacote = cifrar(dados);
  return comEscritorio(escritorioId, (db) =>
    db.integracao.upsert({
      where: { escritorioId_tipo: { escritorioId, tipo } },
      create: semEscritorio({ tipo, dados: pacote, status }),
      update: { dados: pacote, status, erro: null },
    })
  );
}
