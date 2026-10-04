// Registro de aceite dos documentos juridicos.
import { ipDeQuemChamou } from "./origem";
import { comEscritorio, semEscritorio } from "./prisma";
import {
  DOCUMENTOS,
  VERSAO_DOS_DOCUMENTOS,
  type DocumentoJuridico,
} from "./juridico";

export type Assinante = {
  nome: string;
  email: string;
  ip: string | null;
  navegador: string | null;
};

/**
 * Grava o aceite de todos os documentos, na versao vigente.
 *
 * Grava um por documento (e nao um "aceitei tudo"): quando um documento mudar
 * de versao sozinho, da para pedir so o dele.
 */
export async function registrarAceite(
  escritorioId: string,
  assinante: Assinante,
  documentos: readonly DocumentoJuridico[] = DOCUMENTOS.map((d) => d.chave),
): Promise<number> {
  const { count } = await comEscritorio(escritorioId, (db) =>
    db.aceiteDeTermos.createMany({
      data: documentos.map((documento) =>
        semEscritorio({
          usuarioNome: assinante.nome,
          usuarioEmail: assinante.email.toLowerCase(),
          documento,
          versao: VERSAO_DOS_DOCUMENTOS,
          ip: assinante.ip,
          navegador: assinante.navegador?.slice(0, 300) ?? null,
        }),
      ),
    }),
  );
  return count;
}

/** Documentos cuja versao vigente ainda nao foi aceita por este escritorio. */
export async function documentosPendentes(
  escritorioId: string,
): Promise<DocumentoJuridico[]> {
  const aceites = await comEscritorio(escritorioId, (db) =>
    db.aceiteDeTermos.findMany({ where: { versao: VERSAO_DOS_DOCUMENTOS } }),
  );
  const aceitos = new Set(aceites.map((a) => a.documento));
  return DOCUMENTOS.map((d) => d.chave).filter((chave) => !aceitos.has(chave));
}

/**
 * IP do cliente atras do proxy do provedor.
 *
 * A decisao mora em origem.ts, que le a lista pela direita. Lia pela
 * esquerda, que e a parte da lista escrita pelo proprio cliente: quem
 * atacasse escolhia a propria origem e todos os tetos por origem deixavam de
 * existir juntos.
 */
export function ipDaRequisicao(req: Request): string | null {
  return ipDeQuemChamou(req.headers);
}
