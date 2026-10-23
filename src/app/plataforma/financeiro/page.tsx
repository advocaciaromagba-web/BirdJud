import { redirect } from "next/navigation";
import { exigirOperador, SemOperador } from "@/lib/plataforma";
import { NavegacaoDaPlataforma } from "@/componentes/NavegacaoDaPlataforma";
import { EditorDaTabela } from "@/componentes/EditorDaTabela";
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

  const [tabela, config] = await Promise.all([
    tabelaVigente(),
    prismaPlataforma().configuracaoComercial.findUnique({ where: { id: "PLATAFORMA" } }),
  ]);

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
    </main>
  );
}
