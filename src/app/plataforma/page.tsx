import Link from "next/link";
import { redirect } from "next/navigation";
import { prismaPlataforma } from "@/lib/prisma";
import { exigirOperador, SemOperador } from "@/lib/plataforma";
import { emReais } from "@/lib/dinheiro";
import { analisarCarteira, competenciaDe, rotuloDoMes } from "@/lib/painel-plataforma";
import { NavegacaoDaPlataforma } from "@/componentes/NavegacaoDaPlataforma";
import { CATEGORICA, Colunas, Numero, ORDINAL, Pizza } from "@/componentes/GraficosDoPainel";

export const dynamic = "force-dynamic";

/**
 * Painel da plataforma: a carteira da Blackbird. Le com o papel da
 * plataforma, que enxerga todos os escritorios — e por isso so abre para o
 * operador. Numeros, nunca dados de cliente de escritorio.
 */
export default async function PainelDaPlataforma() {
  let operador;
  try {
    operador = await exigirOperador();
  } catch (erro) {
    if (erro instanceof SemOperador) redirect("/plataforma/login");
    throw erro;
  }

  const agora = new Date();
  const desde = new Date(agora.getTime() - 400 * 24 * 60 * 60 * 1000);
  const escritorios = await prismaPlataforma().escritorio.findMany({
    select: {
      id: true, nome: true, status: true, faixa: true, criadoEm: true, encerradoEm: true,
      implantadoEm: true, entregueEm: true, slug: true,
      assinatura: { select: { valorCentavos: true, diaVencimento: true, fimDoTeste: true, canceladaEm: true } },
      faturas: {
        where: { OR: [{ status: "ABERTA" }, { pagoEm: { gte: desde } }] },
        select: { competencia: true, valorCentavos: true, vencimento: true, status: true, pagoEm: true },
      },
    },
  });

  const a = analisarCarteira(escritorios, agora);
  const proximo = a.previsao[0];
  const emImplantacao = escritorios.filter((e) => e.implantadoEm && !e.entregueEm);

  return (
    <main className="pagina">
      <NavegacaoDaPlataforma ativo="/plataforma" operador={operador.nome} />
      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1>Painel da plataforma</h1>
        <p className="text-sm text-slate-500">
          {rotuloDoMes(competenciaDe(agora))} · atualizado agora
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Numero
          rotulo="Receita mensal"
          valor={emReais(a.receitaMensal)}
          detalhe={`${a.pagantes} pagante(s) · ticket ${emReais(a.ticketMedio)}`}
        />
        <Numero
          rotulo="Escritorios"
          valor={String(a.escritorios.total)}
          detalhe={`${a.escritorios.porStatus.find((s) => s.chave === "TESTE")!.valor} em teste`}
        />
        <Numero
          rotulo="Vencido"
          valor={emReais(a.vencido.total)}
          detalhe={
            a.vencido.total
              ? `${a.vencido.escritorios} escritorio(s) · ${a.vencido.porcentoDaReceita}% da receita`
              : "nada em atraso"
          }
          alerta={a.vencido.total > 0}
        />
        <Numero rotulo="Recebido no mes" valor={emReais(a.recebidoNoMes)} detalhe="faturas pagas neste mes" />
        <Numero
          rotulo={`Previsto ${proximo?.rotulo ?? ""}`}
          valor={emReais(proximo?.garantido ?? 0)}
          detalhe={proximo?.testes ? `+ ${emReais(proximo.testes)} se os testes assinarem` : "garantido pelas assinaturas"}
        />
      </div>

      <section className="cartao mt-6">
        <h2 className="text-lg font-bold">Analise</h2>
        <ul className="mt-3 grid gap-2 text-slate-700">
          {a.textos.map((t) => (
            <li key={t} className="flex gap-2 leading-relaxed">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Pizza
          titulo="Escritorios por situacao"
          fatias={a.escritorios.porStatus}
          cores={CATEGORICA}
          formato="contagem"
          vazio="Nenhum escritorio ainda."
        />
        <Pizza
          titulo="Receita mensal por faixa"
          fatias={a.porFaixa}
          cores={ORDINAL}
          formato="moeda"
          vazio="Sem escritorio pagante ainda: a receita aparece com a primeira assinatura cobrada."
        />
        <Pizza
          titulo="Vencido por tempo de atraso"
          fatias={a.vencido.porIdade}
          cores={ORDINAL.slice(1)}
          formato="moeda"
          vazio="Nenhuma fatura vencida em aberto."
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Colunas
          titulo="Previsao de recebimentos"
          explicacao="Garantido: assinaturas de quem ja paga. Testes: quem sai do teste antes do vencimento do mes, se assinar."
          meses={a.previsao.map((m) => ({ rotulo: m.rotulo, valores: [m.garantido, m.testes] }))}
          series={[
            { rotulo: "Garantido", cor: CATEGORICA[0] },
            { rotulo: "Testes, se assinarem", cor: CATEGORICA[1] },
          ]}
        />
        <Colunas
          titulo="Recebido nos ultimos meses"
          explicacao="Faturas pagas, pelo mes em que o dinheiro entrou. O mes corrente ainda esta em curso."
          meses={a.recebidos.map((m) => ({ rotulo: m.rotulo, valores: [m.valor] }))}
          series={[{ rotulo: "Recebido", cor: CATEGORICA[0] }]}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="cartao">
          <h2 className="text-lg font-bold">Testes terminando em 7 dias</h2>
          {a.testesAcabando.length ? (
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {a.testesAcabando.map((t) => (
                <li key={t.nome} className="flex justify-between py-2">
                  <span>{t.nome}</span>
                  <span className="tabular-nums text-slate-600">
                    {t.fimDoTeste.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {emReais(t.valor)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Nenhum teste termina nesta semana.</p>
          )}
        </section>
        <section className="cartao">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Implantacoes em andamento</h2>
            <Link href="/plataforma/novo" className="botao-secundario">
              Implantar escritorio
            </Link>
          </div>
          {emImplantacao.length ? (
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {emImplantacao.map((e) => (
                <li key={e.id} className="flex justify-between py-2">
                  <Link href={`/plataforma/${e.id}/implantacao`} className="font-medium text-[color:var(--marca-primaria)] hover:underline">
                    {e.nome}
                  </Link>
                  <span className="text-slate-500">ainda nao entregue</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Nenhuma implantacao aberta: tudo o que foi montado ja foi entregue.</p>
          )}
        </section>
      </div>
    </main>
  );
}
