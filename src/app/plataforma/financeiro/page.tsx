import { redirect } from "next/navigation";
import { exigirOperador, SemOperador } from "@/lib/plataforma";
import { NavegacaoDaPlataforma } from "@/componentes/NavegacaoDaPlataforma";
import { EditorDaTabela } from "@/componentes/EditorDaTabela";
import { GestaoDeCupons } from "@/componentes/GestaoDeCupons";
import { ReajusteDeContratos } from "@/componentes/ReajusteDeContratos";
import { emReais } from "@/lib/dinheiro";
import { tabelaVigente } from "@/lib/tabela-de-precos";
import { prismaPlataforma } from "@/lib/prisma";
import { PLANO, PLANOS } from "@/lib/planos";
import { FAIXAS, LIMITES } from "@/lib/catalogo";
import { TABELA_PADRAO } from "@/lib/precos";
import { ROTULO_DO_MODULO } from "@/lib/rotulos";
import type { Modulo } from "@/lib/modulos";

export const dynamic = "force-dynamic";

/**
 * Financeiro da plataforma: a tabela de precos, os descontos de ciclo, os
 * cupons, a isencao e o reajuste dos contratos.
 */
export default async function FinanceiroDaPlataforma() {
  let operador;
  try {
    operador = await exigirOperador();
  } catch (erro) {
    if (erro instanceof SemOperador) redirect("/plataforma/login");
    throw erro;
  }

  const [tabela, config, cupons, isentos] = await Promise.all([
    tabelaVigente(),
    prismaPlataforma().configuracaoComercial.findUnique({ where: { id: "PLATAFORMA" } }),
    prismaPlataforma().cupom.findMany({ orderBy: [{ ativo: "desc" }, { criadoEm: "desc" }], take: 200 }),
    prismaPlataforma().assinatura.findMany({
      where: { cortesiaDesde: { not: null }, OR: [{ cortesiaAte: null }, { cortesiaAte: { gt: new Date() } }] },
      select: { escritorioId: true, cortesiaAte: true, cortesiaMotivo: true, escritorio: { select: { nome: true } } },
      orderBy: { escritorio: { nome: "asc" } },
    }),
  ]);
  const dia = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return (
    <main className="pagina">
      <NavegacaoDaPlataforma ativo="/plataforma/financeiro" operador={operador.nome} />
      <h1 className="mt-6">Financeiro da plataforma</h1>
      <p className="chamada">
        Tabela de preços, descontos de ciclo, cupons, isenção e reajuste das mensalidades. Mudar a tabela não muda
        contrato assinado: o valor fechado de cada escritório fica na assinatura dele, e o reajuste dele é feito
        abaixo, uma vez por ano pelo IPCA (cláusula 4 do contrato).
      </p>

      <section className="cartao mt-6">
        <h2 className="text-lg font-bold">Tabela de preços</h2>
        <p className="ajuda">
          {config?.tabela
            ? `Editada por ${config.atualizadaPor ?? "operador"} em ${config.atualizadaEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`
            : "Valendo a tabela padrão do sistema."}{" "}
          A vitrine, o cadastro e a fatura usam esta tabela.
        </p>
        <div className="mt-4">
          <EditorDaTabela
            tabela={tabela}
            planos={PLANOS.map((p) => ({ chave: p, rotulo: PLANO[p].rotulo }))}
            faixas={FAIXAS.map((f) => ({ chave: f, rotulo: LIMITES[f].rotulo }))}
            modulos={(Object.keys(TABELA_PADRAO.modulo) as Modulo[]).map((m) => ({ chave: m, rotulo: ROTULO_DO_MODULO[m] }))}
          />
        </div>
      </section>

      <section className="cartao mt-6">
        <h2 className="text-lg font-bold">Cupons de desconto</h2>
        <div className="mt-4">
          <GestaoDeCupons
            cupons={cupons.map((c) => ({
              id: c.id,
              codigo: c.codigo,
              descricao: c.descricao,
              desconto: c.percentual != null ? `${c.percentual}%` : `${emReais(c.valorCentavos ?? 0)}/mês`,
              duracao: c.meses ? `${c.meses} mês(es)` : "sempre",
              validade: c.validoAte ? `até ${dia(new Date(c.validoAte.getTime() - 1))}` : "sem prazo",
              usos: c.maxUsos != null ? `${c.usos} de ${c.maxUsos}` : String(c.usos),
              ativo: c.ativo,
            }))}
          />
        </div>
      </section>

      <section className="cartao mt-6">
        <h2 className="text-lg font-bold">Reajuste dos contratos</h2>
        <p className="ajuda">
          Aplica o percentual ao valor fechado de cada escritório. Quem não tem valor fechado segue a tabela e acompanha o
          reajuste da tabela, acima.
        </p>
        <div className="mt-3">
          <ReajusteDeContratos />
        </div>
      </section>

      <section className="cartao mt-6">
        <h2 className="text-lg font-bold">Isenções e cortesias em vigor</h2>
        <p className="ajuda">Concedidas na ficha de cada escritório, sem prazo ou até uma data.</p>
        {isentos.length ? (
          <ul className="mt-3 divide-y divide-slate-200 text-sm">
            {isentos.map((i) => (
              <li key={i.escritorioId} className="py-2">
                <a className="font-semibold underline" href={`/plataforma/${i.escritorioId}`}>
                  {i.escritorio.nome}
                </a>{" "}
                · {i.cortesiaAte ? `até ${dia(new Date(i.cortesiaAte.getTime() - 1))}` : "sem prazo"}
                {i.cortesiaMotivo ? <span className="block text-slate-500">{i.cortesiaMotivo}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="vazio mt-3">Nenhuma isenção em vigor.</p>
        )}
      </section>
    </main>
  );
}
