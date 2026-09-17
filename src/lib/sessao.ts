// Guarda de rota: sessao + escritorio do subdominio + modulo contratado.
//
// A checagem que mais importa e a terceira: uma sessao aberta no escritorio A
// nao vale no subdominio do escritorio B. Sem ela, bastaria trocar o endereco
// no navegador levando o cookie junto.
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { opcoesAuth } from "./auth";
import { STATUS_QUE_ENTRAM } from "./auth-comum";
import { escritorioPorSlug, type Marca } from "./escritorio";
import { exigirModulo, type Modulo } from "./modulos";
import { CABECALHO_SLUG } from "./subdominio";

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
};

/** Escritorio do endereco atual, sem exigir sessao (tela de login). */
export async function escritorioDoEndereco(): Promise<Marca | null> {
  const slug = headers().get(CABECALHO_SLUG);
  if (!slug) return null;
  return escritorioPorSlug(slug);
}

/**
 * Exige sessao valida PARA O ESCRITORIO DESTE ENDERECO.
 * Opcionalmente exige tambem um modulo contratado.
 */
export async function exigirSessao(modulo?: Modulo): Promise<ContextoRota> {
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

  if (modulo) await exigirModulo(marca.id, modulo);

  return {
    escritorioId: marca.id,
    usuarioId: sessao.usuarioId,
    papel: sessao.papel,
    marca,
  };
}

/**
 * Versao pura da regra acima, para poder ser testada sem subir o Next.
 * Devolve null quando a sessao vale para o endereco.
 */
export function motivoParaRecusar(
  escritorioDoEndereco: { id: string; status: string } | null,
  sessao: { escritorioId: string } | null
): string | null {
  if (!escritorioDoEndereco) return "Endereco sem escritorio.";
  if (!STATUS_QUE_ENTRAM.has(escritorioDoEndereco.status)) {
    return "Escritorio suspenso ou encerrado.";
  }
  if (!sessao) return "Sessao ausente ou invalida para este endereco.";
  if (sessao.escritorioId !== escritorioDoEndereco.id) return "Sessao de outro escritorio.";
  return null;
}
