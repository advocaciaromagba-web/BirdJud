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

/**
 * Le a credencial do escritorio.
 *
 * Por padrao, integracao marcada com ERRO e tratada como ausente: quem for
 * enviar uma mensagem nao deve usar credencial que sabidamente falhou. A tela
 * de integracoes passa `mesmoComErro` para poder testar de novo.
 */
export async function obterIntegracao<T = Record<string, unknown>>(
  escritorioId: string,
  tipo: TipoIntegracao,
  opcoes: { mesmoComErro?: boolean } = {}
): Promise<T> {
  const registro = await comEscritorio(escritorioId, (db) =>
    db.integracao.findFirst({ where: { tipo } })
  );
  if (!registro) throw new IntegracaoAusente(tipo);
  if (registro.status === "ERRO" && !opcoes.mesmoComErro) throw new IntegracaoAusente(tipo);
  return decifrar<T>(registro.dados);
}

export async function apagarIntegracao(
  escritorioId: string,
  tipo: TipoIntegracao
): Promise<void> {
  await comEscritorio(escritorioId, (db) => db.integracao.deleteMany({ where: { tipo } }));
}

/** Guarda o resultado do teste sem tocar nas credenciais. */
export async function anotarTeste(
  escritorioId: string,
  tipo: TipoIntegracao,
  ok: boolean,
  detalhe: string
): Promise<void> {
  await comEscritorio(escritorioId, (db) =>
    db.integracao.updateMany({
      where: { tipo },
      data: {
        status: ok ? "OK" : "ERRO",
        erro: ok ? null : detalhe.slice(0, 500),
        verificadoEm: new Date(),
      },
    })
  );
}

export async function salvarIntegracao(
  escritorioId: string,
  tipo: TipoIntegracao,
  dados: Record<string, unknown>,
  status: "PENDENTE" | "OK" | "ERRO" = "PENDENTE",
  erro: string | null = null
) {
  const pacote = cifrar(dados);
  return comEscritorio(escritorioId, (db) =>
    db.integracao.upsert({
      where: { escritorioId_tipo: { escritorioId, tipo } },
      create: semEscritorio({ tipo, dados: pacote, status, erro: erro?.slice(0, 500) ?? null }),
      update: {
        dados: pacote,
        status,
        erro: erro?.slice(0, 500) ?? null,
        verificadoEm: new Date(),
      },
    })
  );
}
