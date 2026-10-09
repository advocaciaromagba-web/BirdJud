import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { comEscritorio, prismaPlataforma } from "@/lib/prisma";
import { exigirOperador, registrarAcessoSuporte, SemOperador } from "@/lib/plataforma";
import { modulosAtivos } from "@/lib/modulos";
import { CONECTORES } from "@/lib/conectores";
import { roteiroDoEscritorio } from "@/lib/primeiros-passos-do-escritorio";
import { documentosPendentes } from "@/lib/aceite";
import { dominioDaPlataforma } from "@/lib/dominio";
import { FASES } from "@/lib/primeiros-passos";
import { NavegacaoDaPlataforma } from "@/componentes/NavegacaoDaPlataforma";
import { PainelImplantacao, type DadosDaImplantacao } from "@/componentes/PainelImplantacao";

export const dynamic = "force-dynamic";

/**
 * A implantacao de um escritorio, feita pela plataforma.
 *
 * O roteiro e o MESMO que o escritorio ve em Primeiros passos, medido do
 * mesmo jeito: o operador nao marca nada como feito, ele faz — e a tela mostra
 * o efeito.
 */
export default async function ImplantacaoDoEscritorio({ params }: { params: Promise<{ id: string }> }) {
  let operador;
  try {
    operador = await exigirOperador();
  } catch (erro) {
    if (erro instanceof SemOperador) redirect("/plataforma/login");
    throw erro;
  }
  const { id } = await params;
  const escritorio = await prismaPlataforma().escritorio.findUnique({
    where: { id },
    include: { assinatura: true },
  });
  if (!escritorio) notFound();
  await registrarAcessoSuporte(operador.operadorId, id, "Abertura da implantacao");

  const modulos = await modulosAtivos(id);
  const [roteiro, pendentes, d] = await Promise.all([
    roteiroDoEscritorio(id),
    documentosPendentes(id),
    comEscritorio(id, async (db) => ({
      pessoas: await db.usuario.findMany({
        orderBy: [{ papel: "asc" }, { nome: "asc" }],
        select: {
          id: true, nome: true, email: true, papel: true, oab: true, telefone: true,
          recebeWhatsapp: true, ultimoAcesso: true, ativo: true,
        },
      }),
      convites: await db.redefinicaoDeSenha.findMany({
        where: { tipo: "CONVITE" },
        orderBy: { criadoEm: "desc" },
        select: { usuarioId: true, criadoEm: true, expiraEm: true, usadoEm: true },
      }),
      oabs: await db.oabMonitorada.findMany({ orderBy: { criadoEm: "asc" } }),
      integracoes: await db.integracao.findMany({ select: { tipo: true, status: true, erro: true, verificadoEm: true } }),
    })),
  ]);

  const ultimoConvite = new Map<string, (typeof d.convites)[number]>();
  for (const c of d.convites) if (!ultimoConvite.has(c.usuarioId)) ultimoConvite.set(c.usuarioId, c);
  const porTipo = new Map(d.integracoes.map((i) => [i.tipo, i]));

  const dados: DadosDaImplantacao = {
    id,
    nome: escritorio.nome,
    endereco: `${escritorio.slug}.${dominioDaPlataforma()}`,
    status: escritorio.status,
    implantadoEm: escritorio.implantadoEm?.toISOString() ?? null,
    entregueEm: escritorio.entregueEm?.toISOString() ?? null,
    temDjen: modulos.includes("PUBLICACOES_DJEN"),
    temNuvem: modulos.includes("NUVEM"),
    aceitePendente: pendentes.length > 0,
    escritorio: {
      razaoSocial: escritorio.razaoSocial ?? "",
      cnpj: escritorio.cnpj ?? "",
      telefoneAtendimento: escritorio.telefoneAtendimento ?? "",
      cidade: escritorio.cidade ?? "",
      corPrimaria: escritorio.corPrimaria ?? "#0B1F3B",
      corSecundaria: escritorio.corSecundaria ?? "#D4AF7C",
    },
    pessoas: d.pessoas.map((p) => {
      const c = ultimoConvite.get(p.id);
      return {
        id: p.id, nome: p.nome, email: p.email, papel: p.papel, oab: p.oab, telefone: p.telefone,
        recebeWhatsapp: p.recebeWhatsapp, ativo: p.ativo,
        situacao: p.ultimoAcesso
          ? ("ENTROU" as const)
          : c && !c.usadoEm && c.expiraEm > new Date()
            ? ("CONVIDADO" as const)
            : c
              ? ("CONVITE_VENCIDO" as const)
              : ("AGUARDANDO" as const),
        conviteEm: c?.criadoEm.toISOString() ?? null,
      };
    }),
    oabs: d.oabs.map((o) => ({ id: o.id, numero: o.numero, uf: o.uf, nomeAdvogado: o.nomeAdvogado })),
    integracoes: Object.values(CONECTORES)
      .filter((c) => !c.modulo || modulos.includes(c.modulo))
      .map((c) => {
        const g = porTipo.get(c.tipo);
        return {
          tipo: c.tipo,
          rotulo: c.rotulo,
          descricao: c.descricao,
          campos: c.campos,
          oauth: Boolean(c.oauth),
          status: g?.status ?? null,
          erro: g?.erro ?? null,
          verificadoEm: g?.verificadoEm?.toISOString() ?? null,
        };
      }),
    roteiro: {
      passos: roteiro.passos,
      feitos: roteiro.feitos,
      total: roteiro.total,
      porcento: roteiro.porcento,
    },
    fases: FASES.map((f) => ({ chave: f.chave, titulo: f.titulo })),
  };

  return (
    <main className="pagina">
      <NavegacaoDaPlataforma ativo={null} operador={operador.nome} />
      <Link href={`/plataforma/${id}`} className="mt-4 inline-block text-sm text-slate-500">
        ← ficha comercial do escritorio
      </Link>
      <PainelImplantacao dados={dados} />
    </main>
  );
}
