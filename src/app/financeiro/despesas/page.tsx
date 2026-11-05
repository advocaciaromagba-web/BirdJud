import Link from "next/link";
import { AbasDoFinanceiro } from "@/componentes/AbasDoFinanceiro";
import { Estrutura } from "@/componentes/Estrutura";
import { FormularioCriar } from "@/componentes/FormularioCriar";
import { LeituraDeContasEmLote } from "@/componentes/LeituraDeContasEmLote";
import { ListaFinanceira } from "@/componentes/ListaFinanceira";
import { PortaDeAdministracao } from "@/componentes/PortaDeAdministracao";
import { MINUTOS_DESTRAVADO } from "@/lib/administracao";
import { emReais } from "@/lib/dinheiro";
import { filtroDaUrl, relacaoDeDespesas, type FiltroDeDespesas } from "@/lib/despesas";
import { CATEGORIAS_DE_DESPESA, rotuloDaCategoria } from "@/lib/financeiro";
import { modulosAtivos, ModuloNaoContratado } from "@/lib/modulos";
import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina, contextoProtegido } from "@/lib/pagina";

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
  let porta;
  try {
    porta = await contextoProtegido("FINANCEIRO");
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
  if (porta.tranca) {
    const base = await contextoDaPagina();
    const ativos = await modulosAtivos(base.escritorioId);
    return (
      <Estrutura nomeEscritorio={base.marca.nome} logoUrl={base.marca.logoUrl} papel={base.papel} modulos={ativos} titulo="Financeiro">
        <PortaDeAdministracao tranca={porta.tranca} area="O financeiro" minutos={MINUTOS_DESTRAVADO} />
      </Estrutura>
    );
  }

  const contexto = porta.contexto;
  const modulos = await modulosAtivos(contexto.escritorioId);
  const f = filtroDaUrl(await searchParams);
  const { linhas, cortada, totais } = await relacaoDeDespesas(contexto.escritorioId, f);
  const pendentesDoExtrato = modulos.includes("COBRANCAS")
    ? await comEscritorio(contexto.escritorioId, (db) => db.entradaDeExtrato.count({ where: { situacao: "PENDENTE" } }))
    : 0;
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
      <AbasDoFinanceiro
        ativa="DESPESAS"
        temLivroCaixa
        temExtrato={modulos.includes("COBRANCAS") && Boolean(contexto.acesso.CONCILIACAO)}
        pendentes={pendentesDoExtrato}
      />

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
    </Estrutura>
  );
}
