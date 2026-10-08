import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { Estrutura } from "@/componentes/Estrutura";
import { RespostasNoWhatsapp } from "@/componentes/RespostasNoWhatsapp";
import { respostasParaLer } from "@/lib/entrada-whatsapp";
import { formatarNumeroProcesso } from "@/lib/leitura-publicacao";
import { PainelAgenda, type CompromissoNaTela } from "@/componentes/PainelAgenda";

export const dynamic = "force-dynamic";

export default async function PaginaAgenda() {
  const contexto = await contextoDaPagina(undefined, "AGENDA");

  const modulos = await modulosAtivos(contexto.escritorioId);
  const { compromissos, processos, clientes, equipe } = await comEscritorio(
    contexto.escritorioId,
    async (db) => ({
      // De ontem em diante: o que passou ha mais de um dia ja esta a caminho
      // da auditoria (ver arquivarVencidos), e prazo e tarefa vencidos tem
      // tela propria.
      compromissos: await db.compromisso.findMany({
        where: { inicio: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        orderBy: { inicio: "asc" },
        take: 300,
        include: {
          processo: { select: { numero: true } },
          cliente: { select: { nome: true } },
          responsavel: { select: { nome: true } },
          participantes: {
            orderBy: { criadoEm: "asc" },
            include: { cliente: { select: { nome: true } } },
          },
        },
      }),
      processos: await db.processo.findMany({
        orderBy: { criadoEm: "desc" },
        take: 500,
        select: { id: true, numero: true },
      }),
      equipe: await db.usuario.findMany({
        where: { ativo: true },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true, papel: true },
        take: 200,
      }),
      clientes: await db.cliente.findMany({
        orderBy: { nome: "asc" },
        take: 500,
        select: { id: true, nome: true },
      }),
    }),
  );

  // Nao e so enfeite: o sistema prometeu a quem escreveu que alguem do
  // escritorio ia ler. Esta e a tela onde se le.
  const naCaixa = modulos.includes("WHATSAPP")
    ? await respostasParaLer(contexto.escritorioId)
    : [];

  const naTela: CompromissoNaTela[] = compromissos.map((c) => ({
    id: c.id,
    titulo: c.titulo,
    tipo: c.tipo,
    inicioISO: c.inicio.toISOString(),
    local: c.local,
    link: c.link,
    observacoes: c.observacoes,
    concluido: c.concluido,
    processoId: c.processoId,
    numeroProcesso: c.processo ? formatarNumeroProcesso(c.processo.numero) : null,
    clienteId: c.clienteId,
    nomeDoCliente: c.cliente?.nome ?? null,
    responsavelId: c.responsavelId,
    nomeDoResponsavel: c.responsavel?.nome ?? null,
    participantes: c.participantes.map((p) => ({
      clienteId: p.clienteId,
      // O nome do cliente vem do cadastro, sempre.
      nome: p.clienteId ? "" : (p.nome ?? ""),
      telefone: p.telefone ?? "",
      email: p.email ?? "",
      papel: p.papel ?? "",
      avisar: p.avisar,
    })),
    nomesDosParticipantes: c.participantes
      .map((p) => p.cliente?.nome ?? p.nome ?? "")
      .filter(Boolean),
    respostas: c.participantes.map((p) => ({
      nome: p.cliente?.nome ?? p.nome ?? "(sem nome)",
      confirmou: p.confirmadoEm !== null,
      recusou: p.recusadoEm !== null,
    })),
  }));

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      nomeUsuario={contexto.nomeUsuario}
      acesso={contexto.acesso}
      modulos={modulos}
      titulo="Agenda"
      chamada="Audiencias, pericias e atendimentos do escritorio."
    >
      <RespostasNoWhatsapp
        respostas={naCaixa.map((r) => ({
          id: r.id,
          telefone: r.telefone,
          texto: r.texto,
          criadoEm: r.criadoEm.toISOString(),
        }))}
      />

      <PainelAgenda
        compromissos={naTela}
        equipe={equipe}
        clientes={clientes}
        processos={processos.map((p) => ({
          id: p.id,
          numero: formatarNumeroProcesso(p.numero),
        }))}
        comWhatsapp={modulos.includes("WHATSAPP")}
        comIA={modulos.includes("IA")}
      />
    </Estrutura>
  );
}
