import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { formatarNumeroProcesso } from "@/lib/leitura-publicacao";
import { paraBR } from "@/lib/prazos";
import {
  calendarioDoEscritorio,
  hoje,
  urgenciaDoPrazo,
} from "@/lib/prazos-do-escritorio";
import { Estrutura } from "@/componentes/Estrutura";
import { PainelPrazos, type PrazoNaTela } from "@/componentes/PainelPrazos";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function PaginaPrazos() {
  const contexto = await contextoDaPagina();
  const modulos = await modulosAtivos(contexto.escritorioId);
  const hojeISO = hoje();

  const [calendario, dados] = await Promise.all([
    calendarioDoEscritorio(contexto.escritorioId),
    comEscritorio(contexto.escritorioId, async (db) => ({
      prazos: await db.prazo.findMany({
        orderBy: [{ cumpridoEm: "asc" }, { vencimento: "asc" }],
        take: 300,
        include: {
          processo: { select: { numero: true } },
          cliente: { select: { nome: true } },
        },
      }),
      processos: await db.processo.findMany({
        orderBy: { criadoEm: "desc" },
        take: 200,
        select: { id: true, numero: true },
      }),
      clientes: await db.cliente.findMany({
        orderBy: { nome: "asc" },
        take: 200,
        select: { id: true, nome: true },
      }),
    })),
  ]);

  const prazos: PrazoNaTela[] = dados.prazos.map((p) => {
    const vencimento = iso(p.vencimento);
    const { urgencia, diasUteis } = urgenciaDoPrazo(
      vencimento,
      hojeISO,
      calendario,
    );
    return {
      id: p.id,
      titulo: p.titulo,
      vencimento,
      vencimentoBR: paraBR(vencimento),
      inicioBR: paraBR(iso(p.inicioContagem)),
      explicacao: p.explicacao,
      contagem: p.contagem,
      dias: p.dias,
      urgencia,
      diasUteis,
      cumprido: p.cumpridoEm !== null,
      vinculo:
        [
          p.processo ? `Processo ${formatarNumeroProcesso(p.processo.numero)}` : null,
          p.cliente ? p.cliente.nome : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      observacao: p.observacao,
    };
  });

  const emAberto = prazos.filter((p) => !p.cumprido);
  const apertados = emAberto.filter(
    (p) => p.urgencia === "VENCIDO" || p.urgencia === "HOJE" || p.urgencia === "URGENTE",
  ).length;

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      modulos={modulos}
      titulo="Prazos"
      chamada={
        emAberto.length === 0
          ? "Nenhum prazo em aberto."
          : `${emAberto.length} em aberto${apertados > 0 ? ` · ${apertados} apertado(s)` : ""}.`
      }
    >
      <PainelPrazos
        prazos={prazos}
        processos={dados.processos.map((p) => ({
          valor: p.id,
          rotulo: formatarNumeroProcesso(p.numero),
        }))}
        clientes={dados.clientes.map((c) => ({ valor: c.id, rotulo: c.nome }))}
      />
    </Estrutura>
  );
}
