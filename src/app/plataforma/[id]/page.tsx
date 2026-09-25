import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prismaPlataforma } from "@/lib/prisma";
import {
  exigirOperador,
  registrarAcessoSuporte,
  SemOperador,
} from "@/lib/plataforma";
import { consumoDoMes, competenciaDe } from "@/lib/consumo";
import { usoDaFaixa } from "@/lib/faixas";
import { diasDeAtraso } from "@/lib/cobranca";
import { emReais } from "@/lib/dinheiro";
import {
  AcaoDaFatura,
  AcoesDoEscritorio,
} from "@/componentes/AcoesDoEscritorio";

export default async function EscritorioNoPainel({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let operador;
  try {
    operador = await exigirOperador();
  } catch (erro) {
    if (erro instanceof SemOperador) redirect("/plataforma/login");
    throw erro;
  }

  const escritorio = await prismaPlataforma().escritorio.findUnique({
    where: { id: (await params).id },
    include: {
      assinatura: true,
      faturas: { orderBy: { vencimento: "desc" }, take: 24 },
      modulos: { orderBy: { modulo: "asc" } },
    },
  });
  if (!escritorio) notFound();

  // Olhar os dados de um escritorio e acesso de suporte: fica registrado.
  await registrarAcessoSuporte(
    operador.operadorId,
    escritorio.id,
    "Abertura no painel",
  );

  const [uso, consumo] = await Promise.all([
    usoDaFaixa(escritorio.id),
    consumoDoMes(escritorio.id),
  ]);

  const agora = new Date();

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/plataforma" className="text-sm text-neutral-500">
        ← todos os escritorios
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{escritorio.nome}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {escritorio.slug} · {escritorio.status} · faixa {escritorio.faixa} (
        {uso.rotulo})
      </p>

      <section className="mt-6 rounded border border-neutral-200 p-4 text-sm">
        <h2 className="font-semibold">Assinatura</h2>
        {escritorio.assinatura ? (
          <p className="mt-2 text-neutral-700">
            {emReais(escritorio.assinatura.valorCentavos)} por mes · vencimento
            dia {escritorio.assinatura.diaVencimento} · teste ate{" "}
            {escritorio.assinatura.fimDoTeste.toLocaleDateString("pt-BR")}
          </p>
        ) : (
          <p className="mt-2 text-neutral-600">Sem assinatura.</p>
        )}
        <p className="mt-2 text-neutral-600">
          Advogados {uso.advogados.usados}/{uso.advogados.limite} · apoio{" "}
          {uso.apoio.usados}/{uso.apoio.limite}
        </p>
      </section>

      <AcoesDoEscritorio
        escritorioId={escritorio.id}
        faixaAtual={escritorio.faixa}
        modulos={escritorio.modulos.map((m) => ({
          modulo: m.modulo,
          ativo: m.ativo,
        }))}
      />

      <section className="mt-6">
        <h2 className="font-semibold">Faturas</h2>
        {escritorio.faturas.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-600">
            Nenhuma fatura emitida.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-200 text-sm">
            {escritorio.faturas.map((fatura) => {
              const atraso = diasDeAtraso(fatura.vencimento, agora);
              return (
                <li
                  key={fatura.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2"
                >
                  <span>
                    <span className="font-semibold">{fatura.competencia}</span>
                    <span className="block text-xs text-neutral-500">
                      vence {fatura.vencimento.toLocaleDateString("pt-BR")}
                      {fatura.status === "ABERTA" && atraso > 0
                        ? ` · ${atraso} dia(s) de atraso`
                        : ""}
                      {fatura.pagoEm
                        ? ` · paga em ${fatura.pagoEm.toLocaleDateString("pt-BR")}`
                        : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums">
                      {emReais(fatura.valorCentavos)}
                    </span>
                    <AcaoDaFatura id={fatura.id} status={fatura.status} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">Consumo de {competenciaDe()}</h2>
        {consumo.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-600">
            Nada medido neste mes.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-200 text-sm">
            {consumo.map((linha) => (
              <li
                key={linha.metrica}
                className="flex justify-between gap-4 py-2"
              >
                <span className="text-neutral-600">{linha.metrica}</span>
                <span className="tabular-nums">
                  {linha.quantidade}
                  {linha.franquia !== null ? ` de ${linha.franquia}` : ""}
                  {linha.excedente > 0 ? ` · +${linha.excedente}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
