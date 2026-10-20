// O mapa de acesso de uma pessoa, buscado no banco.
//
// A regra de quem ve o que mora em areas.ts, pura e testada.
import { comEscritorio } from "./prisma";
import { modulosAtivos } from "./modulos";
import { areasDistribuiveis, ehArea, mapaDeAcesso } from "./areas";
import { SemPermissao, type Papel } from "./papeis";

export async function acessoDoUsuario(
  escritorioId: string,
  usuarioId: string,
  papel: Papel,
): Promise<Record<string, boolean>> {
  const [gravadas, modulos] = await Promise.all([
    comEscritorio(escritorioId, (db) =>
      db.permissaoDeArea.findMany({
        where: { usuarioId },
        select: { area: true, permitido: true },
      }),
    ),
    modulosAtivos(escritorioId),
  ]);
  return mapaDeAcesso(papel, gravadas, modulos);
}

/** O que cada pessoa do escritorio pode ver, para a tela de usuarios. */
export async function acessoDeTodos(
  escritorioId: string,
): Promise<Map<string, Record<string, boolean>>> {
  const [usuarios, gravadas, modulos] = await Promise.all([
    comEscritorio(escritorioId, (db) =>
      db.usuario.findMany({ select: { id: true, papel: true } }),
    ),
    comEscritorio(escritorioId, (db) =>
      db.permissaoDeArea.findMany({ select: { usuarioId: true, area: true, permitido: true } }),
    ),
    modulosAtivos(escritorioId),
  ]);

  const porUsuario = new Map<string, { area: string; permitido: boolean }[]>();
  for (const g of gravadas) {
    const lista = porUsuario.get(g.usuarioId) ?? [];
    lista.push({ area: g.area, permitido: g.permitido });
    porUsuario.set(g.usuarioId, lista);
  }

  return new Map(
    usuarios.map((u) => [
      u.id,
      mapaDeAcesso(u.papel as Papel, porUsuario.get(u.id) ?? [], modulos),
    ]),
  );
}

/**
 * Grava a decisao do escritorio sobre uma area.
 *
 * So ADMIN muda, e ninguem muda a propria permissao: um admin nao precisa
 * (ja ve tudo) e, para os outros, poder se liberar seria o painel de
 * permissoes virar o caminho para contornar o painel de permissoes.
 */
export async function definirPermissao(
  escritorioId: string,
  quemMuda: { usuarioId: string; papel: Papel },
  usuarioId: string,
  area: string,
  permitido: boolean,
): Promise<void> {
  if (quemMuda.papel !== "ADMIN") {
    throw new SemPermissao("Só o administrador do escritório muda permissões.");
  }
  if (quemMuda.usuarioId === usuarioId) {
    throw new SemPermissao("Ninguém muda a própria permissão.");
  }
  if (!ehArea(area)) throw new SemPermissao("Área desconhecida.");

  const modulos = await modulosAtivos(escritorioId);
  if (!areasDistribuiveis(modulos).some((a) => a.chave === area)) {
    throw new SemPermissao("Esta área não é distribuível neste escritório.");
  }

  const alvo = await comEscritorio(escritorioId, (db) =>
    db.usuario.findFirst({ where: { id: usuarioId }, select: { id: true } }),
  );
  if (!alvo) throw new SemPermissao("Usuário não encontrado.");

  await comEscritorio(escritorioId, (db) =>
    db.permissaoDeArea.upsert({
      where: { usuarioId_area: { usuarioId, area } },
      update: { permitido },
      create: { escritorioId, usuarioId, area, permitido },
    }),
  );
}
