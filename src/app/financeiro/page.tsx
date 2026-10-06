import { diaBR } from "@/lib/datas";
import Link from "next/link";
import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina, contextoProtegido } from "@/lib/pagina";
import { modulosAtivos, ModuloNaoContratado } from "@/lib/modulos";
import { Estrutura } from "@/componentes/Estrutura";
import { FormularioCriar } from "@/componentes/FormularioCriar";
import { PortaDeAdministracao } from "@/componentes/PortaDeAdministracao";
import { GraficoDePizza } from "@/componentes/GraficoDePizza";
import { ListaFinanceira } from "@/componentes/ListaFinanceira";
import { DespesasFixas } from "@/componentes/DespesasFixas";
import { emReais } from "@/lib/dinheiro";
import { MINUTOS_DESTRAVADO } from "@/lib/administracao";
import { PainelDoAno } from "@/componentes/PainelDoAno";
import { anoDe, anosOferecidos, COMO_ESTA } from "@/lib/metas";
import { anoDoEscritorio } from "@/lib/metas-do-escritorio";
import { hojeNoEscritorio } from "@/lib/contas-do-escritorio";
import {
  CATEGORIAS_DE_DESPESA,
  CATEGORIAS_DE_RECEITA,
  competenciaDaData,
  resumoDoMes,
  rotuloDaCategoria,
} from "@/lib/financeiro";

export const dynamic = "force-dynamic";

const TIPOS = [
  { valor: "DESPESA", rotulo: "Despesa" },
  { valor: "RECEITA", rotulo: "Receita" },
];

const SIM_NAO = [
  { valor: "nao", rotulo: "Em aberto" },
  { valor: "sim", rotulo: "Ja pago / recebido" },
];

const NOME_DO_MES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

const mesPorExtenso = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

function nomeDaCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number);
  return mesPorExtenso.format(new Date(Date.UTC(ano, mes - 1, 15)));
}

function vizinha(competencia: string, passos: number): string {
  const [ano, mes] = competencia.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1 + passos, 15));
  const m = String(data.getUTCMonth() + 1).padStart(2, "0");
  return `${data.getUTCFullYear()}-${m}`;
}

export default async function PaginaFinanceiro({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string; ano?: string }>;
}) {
  let porta;
  try {
    porta = await contextoProtegido("FINANCEIRO");
  } catch (erro) {
    if (erro instanceof ModuloNaoContratado) {
      return (
        <main className="mx-auto max-w-2xl p-10">
          <h1 className="text-2xl font-bold">Modulo nao contratado</h1>
          <p className="mt-3 leitura text-slate-600">
            O modulo Financeiro nao faz parte do plano deste escritorio.
          </p>
        </main>
      );
    }
    throw erro;
  }

  if (porta.tranca) {
    const base = await contextoDaPagina();
    const ativos = await modulosAtivos(base.escritorioId);
    return (
      <Estrutura
        nomeEscritorio={base.marca.nome}
        logoUrl={base.marca.logoUrl}
        papel={base.papel}
        modulos={ativos}
        titulo="Financeiro"
      >
        <PortaDeAdministracao
          tranca={porta.tranca}
          area="O financeiro"
          minutos={MINUTOS_DESTRAVADO}
        />
      </Estrutura>
    );
  }

  const contexto = porta.contexto;
  const parametros = await searchParams;
  const competencia = /^\d{4}-\d{2}$/.test(parametros.competencia ?? "")
    ? parametros.competencia!
    : competenciaDaData(new Date());

  const hoje = hojeNoEscritorio();
  const anoPedido = Number(parametros.ano);
  const ano =
    Number.isInteger(anoPedido) && anoPedido >= 2020 && anoPedido <= 2100
      ? anoPedido
      : anoDe(hoje);

  const modulos = await modulosAtivos(contexto.escritorioId);
  const doAno = await anoDoEscritorio(contexto.escritorioId, ano, hoje);
  const { lancamentos, fixas } = await comEscritorio(
    contexto.escritorioId,
    async (db) => ({
      lancamentos: await db.lancamento.findMany({
        where: { competencia },
        orderBy: [{ vencimento: "asc" }, { criadoEm: "desc" }],
        take: 500,
      }),
      fixas: await db.despesaFixa.findMany({
        orderBy: { diaDoVencimento: "asc" },
      }),
    }),
  );

  const resumo = resumoDoMes(lancamentos, competencia);

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      modulos={modulos}
      titulo="Financeiro"
      chamada={`Competencia de ${nomeDaCompetencia(competencia)}.`}
    >
      <nav className="mt-1 flex items-center gap-3 text-sm">
        <Link className="botao-discreto" href={`/financeiro?competencia=${vizinha(competencia, -1)}`}>
          ← {nomeDaCompetencia(vizinha(competencia, -1))}
        </Link>
        <Link className="botao-discreto" href={`/financeiro?competencia=${vizinha(competencia, 1)}`}>
          {nomeDaCompetencia(vizinha(competencia, 1))} →
        </Link>
      </nav>

      {/* Realizado e previsto separados: um mes com R$ 40 mil lancados e R$ 38
          mil ainda por receber nao e um mes bom, e um total unico esconderia
          isso. */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="cartao">
          <p className="sobretitulo">Recebido</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">
            {emReais(resumo.receitas)}
          </p>
          <p className="mt-1 text-sm text-slate-500 esquerda">
            a receber: {emReais(resumo.aReceber)}
          </p>
        </div>
        <div className="cartao">
          <p className="sobretitulo">Pago</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {emReais(resumo.despesas)}
          </p>
          <p className="mt-1 text-sm text-slate-500 esquerda">
            a pagar: {emReais(resumo.aPagar)}
          </p>
        </div>
        <div className="cartao">
          <p className="sobretitulo">Saldo realizado</p>
          <p
            className={`mt-1 text-2xl font-bold tabular-nums ${
              resumo.saldo < 0 ? "text-red-700" : "text-slate-900"
            }`}
          >
            {emReais(resumo.saldo)}
          </p>
          <p className="mt-1 text-sm text-slate-500 esquerda">
            entradas menos saidas ja liquidadas
          </p>
        </div>
        <div className="cartao">
          <p className="sobretitulo">Previsto no mes</p>
          <p
            className={`mt-1 text-2xl font-bold tabular-nums ${
              resumo.saldo + resumo.aReceber - resumo.aPagar < 0
                ? "text-red-700"
                : "text-slate-900"
            }`}
          >
            {emReais(resumo.saldo + resumo.aReceber - resumo.aPagar)}
          </p>
          <p className="mt-1 text-sm text-slate-500 esquerda">
            se tudo em aberto for liquidado
          </p>
        </div>
      </div>

      <section className="cartao mt-5">
        <p className="sobretitulo">Para onde vai o dinheiro</p>
        <h2 className="mt-1 text-lg font-bold">
          Despesas por categoria em {nomeDaCompetencia(competencia)}
        </h2>
        <div className="mt-4">
          <GraficoDePizza porCategoria={resumo.porCategoria} />
        </div>
      </section>

      <div className="mt-5">
        <FormularioCriar
          rota="/api/lancamentos"
          recolhivel
          textoAbrir="Novo lancamento"
          textoBotao="Lancar"
          leitura={modulos.includes("IA") ? "CONTA" : undefined}
          campos={[
            { nome: "descricao", rotulo: "Descricao", obrigatorio: true, largo: true },
            { nome: "valor", rotulo: "Valor (R$)", obrigatorio: true },
            { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: TIPOS, obrigatorio: true },
            {
              nome: "categoria",
              rotulo: "Categoria",
              tipo: "select",
              opcoes: [...CATEGORIAS_DE_DESPESA, ...CATEGORIAS_DE_RECEITA].map((c) => ({
                valor: c,
                rotulo: rotuloDaCategoria(c),
              })),
              ajuda: "Precisa combinar com o tipo: aluguel e despesa, honorarios e receita.",
            },
            { nome: "fornecedor", rotulo: "Fornecedor / quem emitiu" },
            { nome: "vencimento", rotulo: "Vencimento", tipo: "date" },
            { nome: "pago", rotulo: "Situacao", tipo: "select", opcoes: SIM_NAO },
            { nome: "observacoes", rotulo: "Observacoes", tipo: "textarea" },
          ]}
        />
      </div>

      <section className="mt-5">
        <h2 className="text-lg font-bold">
          Lancamentos de {nomeDaCompetencia(competencia)}
        </h2>
        <div className="mt-3">
          <ListaFinanceira
            lancamentos={lancamentos.map((l) => ({
              ...l,
              vencimento: l.vencimento?.toISOString() ?? null,
              pagoEm: l.pagoEm?.toISOString() ?? null,
            }))}
          />
        </div>
      </section>

      <div className="mt-6">
        <PainelDoAno
          ano={doAno.ano}
          anos={anosOferecidos(anoDe(hoje))}
          meses={doAno.meses.map((m) => ({
            nome: NOME_DO_MES[m.mes - 1],
            realizado: emReais(m.realizadoCentavos),
            realizadoCentavos: m.realizadoCentavos,
            despesas: emReais(m.despesasCentavos),
            previsto: emReais(m.previstoCentavos),
          }))}
          meta={doAno.metaCentavos ? emReais(doAno.metaCentavos) : null}
          ritmo={
            doAno.ritmo
              ? {
                  comoEsta: COMO_ESTA[doAno.ritmo.situacao],
                  situacao: doAno.ritmo.situacao,
                  cumpridoPorCento: Math.round(doAno.ritmo.cumprido * 100),
                  esperado: emReais(doAno.ritmo.esperadoCentavos),
                  diferenca: emReais(Math.abs(doAno.ritmo.diferencaCentavos)),
                  sobra: doAno.ritmo.diferencaCentavos >= 0,
                  falta: emReais(doAno.ritmo.faltaCentavos),
                  porMesRestante:
                    doAno.ritmo.porMesRestanteCentavos === null ||
                    doAno.ritmo.porMesRestanteCentavos === 0
                      ? null
                      : emReais(doAno.ritmo.porMesRestanteCentavos),
                  projecao: emReais(doAno.ritmo.projecaoCentavos),
                }
              : null
          }
          realizado={emReais(doAno.realizadoCentavos)}
          despesas={emReais(doAno.despesasCentavos)}
          previsto={emReais(doAno.previstoCentavos)}
          maiorMes={Math.max(0, ...doAno.meses.map((m) => m.realizadoCentavos))}
        />
      </div>

      <div className="mt-6">
        <DespesasFixas
          despesas={fixas.map((f) => ({
            id: f.id,
            descricao: f.descricao,
            categoria: f.categoria,
            fornecedor: f.fornecedor,
            valorCentavos: f.valorCentavos,
            diaDoVencimento: f.diaDoVencimento,
            ativo: f.ativo,
            inicioEmBR: f.inicioEm ? diaBR(f.inicioEm) : null,
            fimEmBR: f.fimEm ? diaBR(f.fimEm) : null,
          }))}
          competencia={competencia}
          nomeDaCompetencia={nomeDaCompetencia(competencia)}
        />
      </div>
    </Estrutura>
  );
}
