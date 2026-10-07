// Guarda de rota: sessao + escritorio do subdominio + modulo contratado.
//
// A checagem que mais importa e a terceira: uma sessao aberta no escritorio A
// nao vale no subdominio do escritorio B. Sem ela, bastaria trocar o endereco
// no navegador levando o cookie junto.
import { cookies, headers } from "next/headers";
import { comEscritorio } from "./prisma";
import { getServerSession } from "next-auth";
import { opcoesAuth } from "./auth";
import { STATUS_QUE_ENTRAM } from "./auth-comum";
import { escritorioPorSlug, type Marca } from "./escritorio";
import { exigirModulo, modulosAtivos, type Modulo } from "./modulos";
import { SemPermissao, type Papel } from "./papeis";
import { areaPorChave, mapaDeAcesso } from "./areas";
import { CABECALHO_SLUG } from "./subdominio";
import {
  COOKIE as COOKIE_ADM,
  SemDestravar,
  SemSenhaDeAdministracao,
  conferirDestravamento,
  marcaDaSenha,
  segredoDoDestravamento,
} from "./administracao";

export class SemSessao extends Error {
  readonly status = 401;
  constructor(motivo = "Sessao ausente ou invalida para este endereco.") {
    super(motivo);
    this.name = "SemSessao";
  }
}

export type ContextoRota = {
  escritorioId: string;
  usuarioId: string;
  papel: string;
  marca: Marca;
  /**
   * Area -> esta pessoa pode entrar.
   *
   * Vem junto com a sessao, e nao buscado por cada tela, porque o menu precisa
   * dele em TODA tela: deixar cada pagina lembrar de pedir seria garantir que
   * uma esquecesse, e area fechada continuaria aparecendo no menu de alguem.
   */
  acesso: Record<string, boolean>;
  modulos: Modulo[];
};

/** Escritorio do endereco atual, sem exigir sessao (tela de login). */
export async function escritorioDoEndereco(): Promise<Marca | null> {
  const slug = (await headers()).get(CABECALHO_SLUG);
  if (!slug) return null;
  return escritorioPorSlug(slug);
}

/**
 * Exige sessao valida PARA O ESCRITORIO DESTE ENDERECO.
 *
 * Opcionalmente exige tambem um modulo contratado e uma area liberada. A
 * conferencia da area e AQUI, no servidor, e nao so no menu: menu escondido e
 * teatro — quem souber o endereco entra do mesmo jeito.
 */
export async function exigirSessao(
  modulo?: Modulo,
  area?: string,
): Promise<ContextoRota> {
  const marca = await escritorioDoEndereco();
  if (!marca?.id) throw new SemSessao("Endereco sem escritorio.");
  if (!marca.status || !STATUS_QUE_ENTRAM.has(marca.status)) {
    throw new SemSessao("Escritorio suspenso ou encerrado.");
  }

  const sessao = await getServerSession(opcoesAuth);
  if (!sessao?.escritorioId) throw new SemSessao();

  // Cookie de um escritorio nao vale no subdominio de outro.
  if (sessao.escritorioId !== marca.id) {
    throw new SemSessao("Sessao de outro escritorio.");
  }

  // O usuario ainda existe, esta ativo, e a sessao foi emitida depois da
  // ultima revogacao? Um "sim" de 12 horas atras nao basta.
  const usuario = await comEscritorio(marca.id, (db) =>
    db.usuario.findFirst({
      where: { id: sessao.usuarioId },
      select: { ativo: true, sessoesValidasApos: true },
    }),
  );
  if (!usuario?.ativo) throw new SemSessao("Usuario inativo ou removido.");
  if (sessaoRevogada(sessao.emitidaEm, usuario.sessoesValidasApos)) {
    throw new SemSessao("Sessao encerrada. Entre novamente.");
  }

  if (modulo) await exigirModulo(marca.id, modulo);

  // Buscado uma vez e usado duas: para barrar esta area e para o menu saber o
  // que esconder.
  const [gravadas, modulos] = await Promise.all([
    comEscritorio(marca.id, (db) =>
      db.permissaoDeArea.findMany({
        where: { usuarioId: sessao.usuarioId },
        select: { area: true, permitido: true },
      }),
    ),
    modulosAtivos(marca.id),
  ]);
  const acesso = mapaDeAcesso(sessao.papel as Papel, gravadas, modulos);

  if (area && acesso[area] !== true) {
    const nome = areaPorChave(area)?.nome ?? area;
    throw new SemPermissao(`Seu acesso a ${nome} esta fechado neste escritorio.`);
  }

  return {
    escritorioId: marca.id,
    usuarioId: sessao.usuarioId,
    papel: sessao.papel,
    marca,
    acesso,
    modulos,
  };
}

/**
 * A sessao foi emitida antes da ultima revogacao?
 *
 * Funcao pura: a comparacao e o coracao da revogacao, e precisa ser testavel
 * sem banco nem servidor.
 */
export function sessaoRevogada(
  emitidaEm: number,
  sessoesValidasApos: Date | null,
): boolean {
  if (!sessoesValidasApos) return false;
  return emitidaEm < sessoesValidasApos.getTime();
}

/**
 * Versao pura da regra acima, para poder ser testada sem subir o Next.
 * Devolve null quando a sessao vale para o endereco.
 */
export function motivoParaRecusar(
  escritorioDoEndereco: { id: string; status: string } | null,
  sessao: { escritorioId: string } | null,
): string | null {
  if (!escritorioDoEndereco) return "Endereco sem escritorio.";
  if (!STATUS_QUE_ENTRAM.has(escritorioDoEndereco.status)) {
    return "Escritorio suspenso ou encerrado.";
  }
  if (!sessao) return "Sessao ausente ou invalida para este endereco.";
  if (sessao.escritorioId !== escritorioDoEndereco.id)
    return "Sessao de outro escritorio.";
  return null;
}


/** Exige sessao e papel de administrador do escritorio. */
export async function exigirAdmin(modulo?: Modulo): Promise<ContextoRota> {
  const contexto = await exigirSessao(modulo);
  if (contexto.papel !== "ADMIN") throw new SemPermissao();
  return contexto;
}

/**
 * Exige sessao, papel ADMIN e a senha de administracao ja digitada.
 *
 * As tres coisas, nao duas: o papel diz quem pode, a senha diz que e a pessoa
 * mesma, agora. Financeiro e acoes destrutivas passam por aqui.
 */
export async function exigirAdministracao(
  modulo?: Modulo,
): Promise<ContextoRota> {
  const contexto = await exigirAdmin(modulo);

  const escritorio = await comEscritorio(contexto.escritorioId, (db) =>
    db.escritorio.findFirst({
      where: { id: contexto.escritorioId },
      select: { senhaAdminHash: true },
    }),
  );
  // Sem senha definida nao ha "passa direto": a area pede para definir.
  if (!escritorio?.senhaAdminHash) throw new SemSenhaDeAdministracao();

  const cookie = (await cookies()).get(COOKIE_ADM)?.value;
  const motivo = conferirDestravamento(
    cookie,
    {
      escritorioId: contexto.escritorioId,
      usuarioId: contexto.usuarioId,
      marca: marcaDaSenha(escritorio.senhaAdminHash),
    },
    segredoDoDestravamento(),
  );
  if (motivo) throw new SemDestravar(`Area protegida: ${motivo}.`);

  return contexto;
}
