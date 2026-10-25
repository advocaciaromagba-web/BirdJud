import Link from "next/link";
import { ultimoMesDoCupom } from "@/lib/cupons";
import { AcoesDaNotaDaPlataforma } from "@/componentes/AcoesDaNotaDaPlataforma";
import { AcessosDeSuporte } from "@/componentes/AcessosDeSuporte";
import { AcoesNaLista } from "@/componentes/AcoesNaLista";
import { ROTULO_DO_AVISO, type TipoDeAviso } from "@/lib/avisos-de-cobranca";
import { fiscalDaPlataforma, lembreteDoPercentual } from "@/lib/nota-da-plataforma";
import { tabelaVigente } from "@/lib/tabela-de-precos";
import { notFound, redirect } from "next/navigation";
import { prismaPlataforma } from "@/lib/prisma";
import {
  exigirOperador,
  registrarAcessoSuporte,
  SemOperador,
} from "@/lib/plataforma";
import { consumoDoMes, competenciaDe } from "@/lib/consumo";
import { usoDaFaixa } from "@/lib/faixas";
import { resumoDaBaixa } from "@/lib/referencia-cobranca";
import { diasDeAtraso, emCortesia, percentualEmTexto } from "@/lib/cobranca";
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
      assinatura: { include: { cupom: true } },
      faturas: { orderBy: { vencimento: "desc" }, take: 24 },
      modulos: { orderBy: { modulo: "asc" } },
      avisosDeCobranca: { orderBy: { enviadoEm: "desc" }, take: 20 },
    },
  });
  if (!escritorio) notFound();

  // Olhar os dados de um escritorio e acesso de suporte: fica registrado.
  await registrarAcessoSuporte(
    operador.operadorId,
    escritorio.id,
    "Abertura no painel",
  );

  const [uso, consumo, notas] = await Promise.all([
    usoDaFaixa(escritorio.id),
    consumoDoMes(escritorio.id),
    // A nota da mensalidade de cada fatura (Blackbird -> escritorio).
    prismaPlataforma().notaDaPlataforma.findMany({
      where: { escritorioId: escritorio.id },
      orderBy: { criadoEm: "desc" },
    }),
  ]);
  const notaDaFatura = (faturaId: string) =>
    notas.find((n) => n.faturaId === faturaId) ?? notas.find((n) => n.faturaOriginalId === faturaId) ?? null;
  const lembrete = lembreteDoPercentual(await fiscalDaPlataforma());
  const tabela = await tabelaVigente();
  const acessos = await prismaPlataforma().acessoSuporte.findMany({
    where: { escritorioId: escritorio.id },
    orderBy: { iniciadoEm: "desc" },
    take: 15,
    include: { operador: { select: { nome: true } } },
  });

  const agora = new Date();
  const maisAntigaAberta = escritorio.faturas
    .filter((f) => f.status === "ABERTA")
    .sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime())[0];
  const dia = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/plataforma/escritorios" className="text-sm text-slate-500">
        ← todos os escritórios
      </Link>
      <Link
        href={`/plataforma/${escritorio.id}/implantacao`}
        className="botao-principal float-right"
      >
        Implantação e configuração
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{escritorio.nome}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {escritorio.slug} · {escritorio.status} · faixa {escritorio.faixa} (
        {uso.rotulo})
      </p>
      <div className="mt-3">
        <AcoesNaLista
          naFicha
          id={escritorio.id}
          slug={escritorio.slug}
          status={escritorio.status}
          atraso={maisAntigaAberta ? diasDeAtraso(maisAntigaAberta.vencimento, agora) : null}
          temAberta={Boolean(maisAntigaAberta)}
          dados={{
            nome: escritorio.nome,
            razaoSocial: escritorio.razaoSocial,
            cidade: escritorio.cidade,
            telefoneAtendimento: escritorio.telefoneAtendimento,
          }}
        />
      </div>
      {escritorio.status === "SUSPENSO" ? (
        <p className="aviso-erro mt-3 text-sm">
          Suspenso{escritorio.suspensoEm ? ` desde ${dia(escritorio.suspensoEm)}` : ""}
          {escritorio.suspensaoManual ? ` pelo operador: ${escritorio.suspensaoMotivo ?? "sem motivo anotado"}` : " pela régua (15 dias de atraso)"}.
          A equipe não entra até pagar o que está vencido ou você liberar.
        </p>
      ) : null}
      {escritorio.suspensaoAdiadaAte && escritorio.suspensaoAdiadaAte > agora ? (
        <p className="aviso-atencao mt-3 text-sm">
          Suspensão adiada: a régua não suspende até {dia(new Date(escritorio.suspensaoAdiadaAte.getTime() - 1))}.
        </p>
      ) : null}

      <section className="cartao-aperto mt-6 text-sm">
        <h2 className="font-semibold">Assinatura</h2>
        {escritorio.assinatura ? (
          <p className="mt-2 text-slate-700">
            {escritorio.assinatura.ciclo === "ANUAL"
              ? `Anual (${percentualEmTexto(tabela.descontoAnual)} de desconto) · `
              : escritorio.assinatura.ciclo === "TRIMESTRAL"
                ? `Trimestral (${percentualEmTexto(tabela.descontoTrimestral)} de desconto) · `
                : "Mensal · "}
            {/* O periodo faturado vale em qualquer ciclo: quem voltou ao
                mensal so paga mensalidade quando ele acabar. */}
            {escritorio.assinatura.anualAte && escritorio.assinatura.anualAte > new Date()
              ? `período pago até ${escritorio.assinatura.anualAte.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} · `
              : ""}
            {escritorio.assinatura.valorCentavos > 0
              ? `${emReais(escritorio.assinatura.valorCentavos)} por mês (valor fechado)`
              : "valor da tabela"}{" "}
            · vencimento
            dia {escritorio.assinatura.diaVencimento} · teste até{" "}
            {escritorio.assinatura.fimDoTeste.toLocaleDateString("pt-BR")}
          </p>
        ) : (
          <p className="mt-2 text-slate-600">Sem assinatura.</p>
        )}
        {escritorio.assinatura?.cortesiaDesde && emCortesia(escritorio.assinatura) ? (
          <p className="mt-2 font-semibold text-emerald-800">
            Em cortesia desde {escritorio.assinatura.cortesiaDesde.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            {escritorio.assinatura.cortesiaPor ? `, por ${escritorio.assinatura.cortesiaPor}` : ""}
            {escritorio.assinatura.cortesiaAte
              ? `, até ${new Date(escritorio.assinatura.cortesiaAte.getTime() - 1).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}: nenhuma fatura até lá.`
              : ": nenhuma fatura é gerada."}
            {escritorio.assinatura.cortesiaMotivo ? ` Motivo: ${escritorio.assinatura.cortesiaMotivo}` : ""}
          </p>
        ) : null}
        <p className="mt-2 text-slate-600">
          Advogados {uso.advogados.usados}/{uso.advogados.limite} · apoio{" "}
          {uso.apoio.usados}/{uso.apoio.limite}
        </p>
        {/* Sem CNPJ o provedor recusa emitir a fatura, e o escritorio fica
            devendo uma cobrança que nunca lhe foi apresentada. O suporte
            precisa VER isso antes do primeiro vencimento, não descobrir
            depois: e o lado de leitura da acao "cnpj" deste console. */}
        <p className="mt-2 text-slate-600">
          CNPJ{" "}
          {escritorio.cnpj ? (
            escritorio.cnpj
          ) : (
            <strong className="text-amber-700">
              não informado — a cobrança não sai
            </strong>
          )}
        </p>
      </section>

      <AcoesDoEscritorio
        escritorioId={escritorio.id}
        faixaAtual={escritorio.faixa}
        modulos={escritorio.modulos.map((m) => ({
          modulo: m.modulo,
          ativo: m.ativo,
        }))}
        emCortesia={emCortesia(escritorio.assinatura)}
        cupom={
          escritorio.assinatura?.cupom
            ? `${escritorio.assinatura.cupom.codigo}, ${
                escritorio.assinatura.cupom.percentual != null
                  ? `${escritorio.assinatura.cupom.percentual}%`
                  : `${emReais(escritorio.assinatura.cupom.valorCentavos ?? 0)} por mês`
              }${
                escritorio.assinatura.cupomAte
                  ? `, até a fatura de ${ultimoMesDoCupom(escritorio.assinatura.cupomAte)}`
                  : ", sem prazo"
              }`
            : null
        }
        ciclo={escritorio.assinatura?.ciclo ?? null}
        valorCentavos={escritorio.assinatura?.valorCentavos ?? 0}
        emTeste={Boolean(escritorio.assinatura && escritorio.assinatura.fimDoTeste > new Date())}
        descontos={{ anual: percentualEmTexto(tabela.descontoAnual), trimestral: percentualEmTexto(tabela.descontoTrimestral) }}
        encerrado={escritorio.status === "ENCERRADO"}
      />

      <section className="mt-6">
        <h2 className="font-semibold">Avisos de cobrança</h2>
        <p className="ajuda">
          E-mails da régua ao administrador do escritório: lembrete 3 dias antes do vencimento, fatura vencida, atraso de
          5 dias com a data da suspensão, 3 dias antes da suspensão, suspensão e volta do acesso.
        </p>
        {escritorio.avisosDeCobranca.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Nenhum aviso enviado.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {escritorio.avisosDeCobranca.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>
                  {ROTULO_DO_AVISO[a.tipo as TipoDeAviso] ?? a.tipo}
                  {a.porOperador ? <span className="text-slate-500"> · por {a.porOperador}</span> : null}
                </span>
                <span className="text-slate-500">
                  {a.enviadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {a.para}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">Acessos de suporte</h2>
        <p className="ajuda">Registro exigido pelos Termos de Uso (item 5): guardado por 12 meses e mostrado ao escritório quando pedido.</p>
        <AcessosDeSuporte
          escritorioId={escritorio.id}
          acessos={acessos.map((a) => {
            const aberto = Boolean(a.expiraEm && !a.encerradoEm && a.expiraEm > agora);
            return {
              id: a.id,
              quando: a.iniciadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
              operador: a.operador.nome,
              motivo: a.motivo,
              aberto,
              situacao: !a.expiraEm
                ? "ação no console"
                : aberto
                  ? a.linkUsadoEm
                    ? "dentro do escritório agora"
                    : "link gerado, ainda não usado"
                  : a.encerradoEm
                    ? "encerrado"
                    : "vencido",
            };
          })}
        />
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">Faturas</h2>
        {escritorio.faturas.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Nenhuma fatura emitida.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-200 text-sm">
            {escritorio.faturas.map((fatura) => {
              const atraso = diasDeAtraso(fatura.vencimento, agora);
              return (
                <li
                  key={fatura.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2"
                >
                  <span>
                    <span className="font-semibold">{fatura.competencia}</span>
                    <span className="block text-xs text-slate-500">
                      vence {fatura.vencimento.toLocaleDateString("pt-BR")}
                      {fatura.status === "ABERTA" && atraso > 0
                        ? ` · ${atraso} dia(s) de atraso`
                        : ""}
                      {fatura.pagoEm
                        ? ` · paga em ${fatura.pagoEm.toLocaleDateString("pt-BR")}`
                        : ""}
                    </span>
                    {/*
                      Sem isto nao da para distinguir "a cobranca nao foi
                      emitida" de "foi emitida e o escritorio nao pagou" — dois
                      problemas com remédios opostos: um é nosso, o outro é
                      dele.
                    */}
                    <span className="block text-xs">
                      {fatura.linkPagamento ? (
                        <a
                          className="text-[color:var(--marca-primaria)] underline"
                          href={fatura.linkPagamento}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          link de pagamento
                        </a>
                      ) : fatura.status === "ABERTA" ? (
                        <span className="text-amber-700">
                          cobrança ainda não emitida
                        </span>
                      ) : null}
                    </span>
                    {/*
                      Quem pagou, quanto e como. A conta do provedor é
                      compartilhada entre sistemas da Blackbird: sem esta
                      linha, "a fatura está paga" nao dizia por qual caminho o
                      dinheiro entrou nem quem deu a baixa.
                    */}
                    {resumoDaBaixa(fatura.baixa) ? (
                      <span className="block text-xs text-slate-500">
                        {resumoDaBaixa(fatura.baixa)}
                      </span>
                    ) : null}
                    {(() => {
                      const n = notaDaFatura(fatura.id);
                      return (
                        <AcoesDaNotaDaPlataforma
                          faturaId={fatura.id}
                          lembrete={lembrete}
                          nota={
                            n
                              ? {
                                  id: n.id,
                                  status: n.status,
                                  numero: n.numeroNaPrefeitura ?? (n.numero ? String(n.numero) : null),
                                  erro: n.erro,
                                  ambiente: n.ambiente,
                                  enviadaEm: n.enviadaEm
                                    ? n.enviadaEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
                                    : null,
                                }
                              : null
                          }
                        />
                      );
                    })()}
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
          <p className="mt-2 text-sm text-slate-600">Nada medido neste mês.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-200 text-sm">
            {consumo.map((linha) => (
              <li
                key={linha.metrica}
                className="flex justify-between gap-4 py-2"
              >
                <span className="text-slate-600">{linha.metrica}</span>
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
