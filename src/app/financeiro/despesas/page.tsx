import Link from "next/link";
import { AbasDoFinanceiro } from "@/componentes/AbasDoFinanceiro";
import { Estrutura } from "@/componentes/Estrutura";
import { FormularioCriar } from "@/componentes/FormularioCriar";
import { LeituraDeContasEmLote } from "@/componentes/LeituraDeContasEmLote";
import { ListaFinanceira } from "@/componentes/ListaFinanceira";
import { emReais } from "@/lib/dinheiro";
import { filtroDaUrl, relacaoDeDespesas, type FiltroDeDespesas } from "@/lib/despesas";
import { CATEGORIAS_DE_DESPESA, competenciaDaData, rotuloDaCategoria } from "@/lib/financeiro";
import { DespesasFixas } from "@/componentes/DespesasFixas";
import { diaBR } from "@/lib/datas";
import { hojeNoEscritorio } from "@/lib/contas-do-escritorio";
import { modulosAtivos, ModuloNaoContratado } from "@/lib/modulos";
import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";

export const dynamic = "force-dynamic";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SITUACAO: Record<string, string> = { todas: "Todas", pagas: "Pagas", "a-pagar": "A pagar", vencidas: "Vencidas" };

function endereco(f: FiltroDeDespesas, muda: Partial<Record<keyof FiltroDeDespesas, string | number | undefined>>) {
  const p = new URLSearchParams();
  const v = { ...f, ...muda };
  p.set("ano", String(v.ano));
  if (v.mes) p.set("mes", String(v.mes));
  if (v.categoria) p.set("categoria", String(v.categoria));
  if (v.situacao && v.situacao !== "todas") p.set("situacao", String(v.situacao));
  if (v.busca) p.set("busca", String(v.busca));
  return `/financeiro/despesas?${p}`;
}

/**
 * Relacao das despesas: pagas e a pagar no mesmo lugar, com filtro de
 * periodo, categoria, situacao e busca. Embaixo, os dois jeitos de lancar:
 * ler varias contas de uma vez, ou digitar (salario, reembolso, compra no
 * caixa), com "repetir todo mes".
 */
export default async function PaginaDespesas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  // Contas do escritorio: a area DESPESAS, sem a segunda senha. Quem paga a
  // luz e o aluguel nao e, em geral, quem tem a senha do financeiro.
  let contexto;
  try {
    contexto = await contextoDaPagina("FINANCEIRO", "DESPESAS");
  } catch (erro) {
    if (erro instanceof ModuloNaoContratado) {
      return (
        <main className="mx-auto max-w-2xl p-10">
          <h1 className="text-2xl font-bold">Módulo não contratado</h1>
          <p className="mt-3 leitura text-slate-600">O módulo Financeiro não faz parte do plano deste escritório.</p>
        </main>
      );
    }
    throw erro;
  }
  const ehAdmin = contexto.papel === "ADMIN";
  const modulos = await modulosAtivos(contexto.escritorioId);
  const f = filtroDaUrl(await searchParams);
  const { linhas, cortada, totais } = await relacaoDeDespesas(contexto.escritorioId, f);
  const pendentesDoExtrato = modulos.includes("COBRANCAS")
    ? await comEscritorio(contexto.escritorioId, (db) => db.entradaDeExtrato.count({ where: { situacao: "PENDENTE" } }))
    : 0;
  // Para pagar hoje: o que venceu e o que vence hoje, de qualquer competencia.
  // E a fila de quem senta para pagar; o filtro de cima e para consultar.
  const hoje = hojeNoEscritorio();
  const paraHoje = await comEscritorio(contexto.escritorioId, (db) =>
    db.lancamento.findMany({
      where: { tipo: "DESPESA", pagoEm: null, vencimento: { not: null, lt: new Date(new Date(`${hoje}T00:00:00-03:00`).getTime() + 86_400_000) } },
      orderBy: { vencimento: "asc" },
      take: 100,
    }),
  );
  const fixas = await comEscritorio(contexto.escritorioId, (db) => db.despesaFixa.findMany({ orderBy: { diaDoVencimento: "asc" } }));
  const competenciaAtual = competenciaDaData(new Date());
  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 6 }, (_, i) => anoAtual + 1 - i);
  const periodo = f.mes ? `${MESES[f.mes - 1]} de ${f.ano}` : String(f.ano);

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      nomeUsuario={contexto.nomeUsuario}
      acesso={contexto.acesso}
      modulos={modulos}
      titulo="Despesas"
      chamada={`Pagas e a pagar de ${periodo}.`}
    >
      {/* As outras abas sao do caixa, atras da segunda senha: so o administrador as ve. */}
      <AbasDoFinanceiro
        ativa="DESPESAS"
        temLivroCaixa={ehAdmin}
        temExtrato={modulos.includes("COBRANCAS") && Boolean(contexto.acesso.CONCILIACAO)}
        pendentes={pendentesDoExtrato}
      />

      {paraHoje.length ? (
        <section className="cartao mt-4 border-amber-300 bg-amber-50/40" aria-labelledby="para-hoje">
          <h2 id="para-hoje" className="text-lg font-bold">
            Para pagar hoje
          </h2>
          <p className="ajuda">
            {paraHoje.length} conta(s) vencida(s) ou vencendo hoje, somando <strong>{emReais(paraHoje.reduce((s, l) => s + l.valorCentavos, 0))}</strong>. Copie a
            linha digitável, pague no banco e dê baixa aqui; depois da baixa, anexe o comprovante.
          </p>
          <div className="mt-3">
            <ListaFinanceira
              anexos
              lancamentos={paraHoje.map((l) => ({
                ...l,
                vencimento: l.vencimento?.toISOString() ?? null,
                pagoEm: null,
              }))}
            />
          </div>
        </section>
      ) : null}

      <form method="get" className="cartao mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="grid gap-1 text-sm">
          Ano
          <select name="ano" defaultValue={f.ano} className="campo">
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Mês
          <select name="mes" defaultValue={f.mes ?? ""} className="campo">
            <option value="">O ano inteiro</option>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Categoria
          <select name="categoria" defaultValue={f.categoria ?? ""} className="campo">
            <option value="">Todas</option>
            {CATEGORIAS_DE_DESPESA.map((c) => (
              <option key={c} value={c}>
                {rotuloDaCategoria(c)}
              </option>
            ))}
            <option value="SEM">Sem categoria</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Situação
          <select name="situacao" defaultValue={f.situacao} className="campo">
            {Object.entries(SITUACAO).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Busca
          <input name="busca" defaultValue={f.busca ?? ""} placeholder="Descrição ou fornecedor" className="campo" />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-5">
          <button type="submit" className="botao-principal">
            Filtrar
          </button>
          <Link href="/financeiro/despesas" className="botao-discreto">
            Limpar
          </Link>
        </div>
      </form>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="indicador">
          <p className="indicador-numero">{emReais(totais.total)}</p>
          <p className="indicador-rotulo">Total do período</p>
        </div>
        <div className="indicador">
          <p className="indicador-numero">{emReais(totais.pago)}</p>
          <p className="indicador-rotulo">Pago</p>
        </div>
        <div className="indicador">
          <p className="indicador-numero">{emReais(totais.aPagar)}</p>
          <p className="indicador-rotulo">A pagar</p>
        </div>
        <div className="indicador">
          <p className={`indicador-numero ${totais.vencido ? "text-red-700" : ""}`}>{emReais(totais.vencido)}</p>
          <p className="indicador-rotulo">Vencido sem pagar</p>
        </div>
      </div>

      {totais.porCategoria.length ? (
        <section className="cartao mt-4">
          <h2 className="font-semibold">Por categoria</h2>
          <ul className="mt-2 grid max-w-xl gap-1 text-sm">
            {totais.porCategoria.map((c) => (
              <li key={c.categoria ?? "sem"} className="flex justify-between gap-3">
                <Link className="text-marca underline" href={endereco(f, { categoria: c.categoria ?? "SEM" })}>
                  {c.categoria ? rotuloDaCategoria(c.categoria) : "Sem categoria"}
                </Link>
                <span className="tabular-nums">
                  {emReais(c.centavos)} <span className="text-slate-500">({c.quantas})</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-5">
        <h2 className="text-lg font-bold">Despesas</h2>
        {cortada ? <p className="ajuda">Mostrando as {linhas.length} mais recentes; os totais acima somam todas. Estreite o filtro para ver o resto.</p> : null}
        <div className="mt-3">
          <ListaFinanceira
            anexos
            vazio="Nenhuma despesa com este filtro."
            lancamentos={linhas.map((l) => ({
              ...l,
              vencimento: l.vencimento?.toISOString() ?? null,
              pagoEm: l.pagoEm?.toISOString() ?? null,
            }))}
          />
        </div>
      </section>

      <div className="mt-6 grid gap-5 [&>*]:min-w-0">
        {modulos.includes("IA") ? <LeituraDeContasEmLote /> : null}
        <FormularioCriar
          rota="/api/lancamentos"
          recolhivel
          textoAbrir="Lançar despesa à mão"
          textoBotao="Lançar despesa"
          fixos={{ tipo: "DESPESA" }}
          campos={[
            { nome: "descricao", rotulo: "Descrição", obrigatorio: true, largo: true, placeholder: "Ex.: Salário de outubro, reembolso de táxi" },
            { nome: "valor", rotulo: "Valor (R$)", obrigatorio: true, placeholder: "1.250,00" },
            {
              nome: "categoria",
              rotulo: "Categoria",
              tipo: "select",
              opcoes: CATEGORIAS_DE_DESPESA.map((c) => ({ valor: c, rotulo: rotuloDaCategoria(c) })),
            },
            { nome: "fornecedor", rotulo: "Fornecedor / para quem" },
            { nome: "vencimento", rotulo: "Vencimento", tipo: "date" },
            { nome: "linhaDigitavel", rotulo: "Linha digitável do boleto", largo: true, placeholder: "47 ou 48 dígitos, se houver", ajuda: "Fica guardada para copiar no dia de pagar. O arquivo do boleto se anexa depois, pela lista." },
            {
              nome: "pago",
              rotulo: "Situação",
              tipo: "select",
              opcoes: [
                { valor: "nao", rotulo: "A pagar" },
                { valor: "sim", rotulo: "Já paga" },
              ],
            },
            {
              nome: "repetir",
              rotulo: "Repetir todo mês",
              tipo: "select",
              opcoes: [
                { valor: "nao", rotulo: "Não" },
                { valor: "sim", rotulo: "Sim, todo mês" },
              ],
              ajuda: "Vira despesa fixa: o sistema gera a dos próximos meses no mesmo dia de vencimento. A deste mês é esta.",
            },
            { nome: "observacoes", rotulo: "Observações", tipo: "textarea" },
          ]}
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
          competencia={competenciaAtual}
          nomeDaCompetencia={`${MESES[Number(competenciaAtual.slice(5, 7)) - 1]} de ${competenciaAtual.slice(0, 4)}`}
        />
      </div>
    </Estrutura>
  );
}
