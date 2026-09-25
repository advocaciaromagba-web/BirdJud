// Exportacao completa dos dados de um escritorio.
//
// Existe por dois motivos que nao sao negociaveis: saida de cliente (o
// escritorio leva os proprios dados embora) e pedido de titular pela LGPD.
// Por isso ela e completa de verdade — e por isso NAO inclui credencial de
// integracao nem hash de senha: segredo de terceiro e de autenticacao nao e
// dado do escritorio, e um arquivo desses circula por e-mail.
import { comEscritorio, prismaPlataforma } from "./prisma";

export type Exportacao = {
  geradoEm: string;
  escritorio: Record<string, unknown>;
  usuarios: unknown[];
  clientes: unknown[];
  processos: unknown[];
  compromissos: unknown[];
  lancamentos: unknown[];
  modulos: unknown[];
  consumo: unknown[];
  faturas: unknown[];
  integracoes: unknown[];
};

export async function exportarEscritorio(
  escritorioId: string,
): Promise<Exportacao> {
  const escritorio = await prismaPlataforma().escritorio.findUniqueOrThrow({
    where: { id: escritorioId },
    select: {
      id: true,
      slug: true,
      nome: true,
      cnpj: true,
      status: true,
      faixa: true,
      cidade: true,
      enderecos: true,
      expediente: true,
      criadoEm: true,
    },
  });

  return comEscritorio(escritorioId, async (db) => ({
    geradoEm: new Date().toISOString(),
    escritorio,
    usuarios: await db.usuario.findMany({
      // Sem senhaHash e sem doisFatores: segredo de autenticacao nao se exporta.
      select: {
        id: true,
        nome: true,
        email: true,
        papel: true,
        oab: true,
        advogado: true,
        ativo: true,
        ultimoAcesso: true,
        criadoEm: true,
      },
    }),
    clientes: await db.cliente.findMany(),
    processos: await db.processo.findMany(),
    compromissos: await db.compromisso.findMany(),
    lancamentos: await db.lancamento.findMany(),
    modulos: await db.moduloContratado.findMany(),
    consumo: await db.consumoMensal.findMany(),
    faturas: await db.fatura.findMany(),
    integracoes: await db.integracao.findMany({
      // Sem o campo `dados`: a credencial do escritorio nao sai daqui.
      select: { tipo: true, status: true, verificadoEm: true, criadoEm: true },
    }),
  }));
}
