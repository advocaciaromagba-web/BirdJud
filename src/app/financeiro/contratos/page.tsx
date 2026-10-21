import Link from "next/link";
import { AbasDoFinanceiro } from "@/componentes/AbasDoFinanceiro";
import { Estrutura } from "@/componentes/Estrutura";
import { PortaDeAdministracao } from "@/componentes/PortaDeAdministracao";
import { MINUTOS_DESTRAVADO } from "@/lib/administracao";
import { conciliarContratos } from "@/lib/conciliacao-de-contratos";
import { emReais } from "@/lib/dinheiro";
import { modulosAtivos, ModuloNaoContratado } from "@/lib/modulos";
import { contextoDaPagina, contextoProtegido } from "@/lib/pagina";

export const dynamic = "force-dynamic";

/**
 * Contratos x financeiro: o contrato preve, o financeiro lanca, a cobranca
 * sai, o dinheiro entra. Esta tela poe os quatro lado a lado e aponta onde
 * nao batem. So le; o conserto se faz na ficha do cliente ou no lancamento.
 */
export default async function PaginaContratosNoFinanceiro() {
  let porta;
  try {
    porta = await contextoProtegido("FINANCEIRO");
  } catch (erro) {
    if (erro instanceof ModuloNaoContratado) {
      return (
        <main className="mx-auto max-w-2xl p-10">
          <h1 className="text-2xl font-bold">Módulo não contratado</h1>
          <p className="mt-3 leitura text-slate-600">
            O módulo Financeiro não faz parte do plano deste escritório.
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
      <Estrutura nomeEscritorio={base.marca.nome} logoUrl={base.marca.logoUrl} papel={base.papel} modulos={ativos} titulo="Financeiro">
        <PortaDeAdministracao tranca={porta.tranca} area="O financeiro" minutos={MINUTOS_DESTRAVADO} />
      </Estrutura>
    );
  }

  const contexto = porta.contexto;
  const modulos = await modulosAtivos(contexto.escritorioId);
  const c = await conciliarContratos(contexto.escritorioId);
  const comProblema = c.contratos.filter((l) => l.problemas.length > 0);
  const emDia = c.contratos.filter((l) => l.problemas.length === 0);

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      nomeUsuario={contexto.nomeUsuario}
      acesso={contexto.acesso}
      modulos={modulos}
      titulo="Contratos × financeiro"
      chamada="O que cada contrato prevê, o que está lançado, cobrado e recebido. Onde não bate, a tela aponta."
    >
      <AbasDoFinanceiro
        ativa="CONTRATOS"
        temLivroCaixa
        temExtrato={modulos.includes("COBRANCAS") && Boolean(contexto.acesso.CONCILIACAO)}
      />

      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="indicador">
          <p className="indicador-numero">{emReais(c.recebidoCentavos)}</p>
          <p className="indicador-rotulo">Recebido ao todo</p>
        </div>
        <div className="indicador">
          <p className="indicador-numero">{emReais(c.deContratoCentavos)}</p>
          <p className="indicador-rotulo">Veio de parcela de contrato</p>
        </div>
        <div className="indicador">
          <p className="indicador-numero">{emReais(c.avulsoCentavos)}</p>
          <p className="indicador-rotulo">Entrou sem contrato por trás</p>
        </div>
      </section>
      {c.avulsoCentavos > 0 && c.recebidoCentavos > 0 && c.avulsoCentavos * 2 > c.recebidoCentavos ? (
        <p className="ajuda mt-2">
          Mais da metade do que entrou não está ligado a contrato nenhum. Honorários gravados na ficha do
          cliente viram parcelas a receber, e o extrato encontra cada uma na conferência.
        </p>
      ) : null}

      {c.contratos.length === 0 ? (
        <p className="vazio mt-6">
          Nenhum contrato de honorários cadastrado. Eles se gravam na ficha do cliente.
        </p>
      ) : null}

      {comProblema.length > 0 ? (
        <section className="mt-8">
          <h2>Não bate ({comProblema.length})</h2>
          <ul className="mt-3 grid gap-3">
            {comProblema.map((l) => (
              <li key={l.contratoId} className="cartao">
                <Linha l={l} />
                <ul className="mt-2 grid gap-1 text-sm text-amber-800">
                  {l.problemas.map((p) => (
                    <li key={p}>• {p}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {emDia.length > 0 ? (
        <section className="mt-8">
          <h2>Em dia ({emDia.length})</h2>
          <div className="cartao mt-3 p-0">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th className="text-right">Contrato prevê</th>
                  <th className="text-right">Lançado</th>
                  <th className="text-right">Cobrado</th>
                  <th className="text-right">Recebido</th>
                </tr>
              </thead>
              <tbody>
                {emDia.map((l) => (
                  <tr key={l.contratoId}>
                    <td>
                      <Link href={`/clientes/${l.clienteId}`} className="hover:underline">
                        {l.cliente}
                      </Link>
                      {l.ativo ? null : <span className="ml-2 text-xs text-slate-500">encerrado</span>}
                    </td>
                    <td className="text-right">{emReais(l.previstoCentavos)}</td>
                    <td className="text-right">{emReais(l.lancadoCentavos)}</td>
                    <td className="text-right">{emReais(l.cobradoCentavos)}</td>
                    <td className="text-right">{emReais(l.recebidoCentavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </Estrutura>
  );
}

function Linha({ l }: { l: { clienteId: string; cliente: string; descricao: string; ativo: boolean; previstoCentavos: number; lancadoCentavos: number; cobradoCentavos: number; recebidoCentavos: number } }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <p>
        <Link href={`/clientes/${l.clienteId}`} className="font-semibold hover:underline">
          {l.cliente}
        </Link>
        {l.descricao ? <span className="ml-2 text-slate-600">{l.descricao}</span> : null}
        {l.ativo ? null : <span className="ml-2 text-xs text-slate-500">encerrado</span>}
      </p>
      <p className="text-sm text-slate-600">
        Prevê {emReais(l.previstoCentavos)} · lançado {emReais(l.lancadoCentavos)} · cobrado{" "}
        {emReais(l.cobradoCentavos)} · recebido {emReais(l.recebidoCentavos)}
      </p>
    </div>
  );
}
