import { comEscritorio, prismaPlataforma } from "@/lib/prisma";
import { percentualEmTexto } from "@/lib/precos";
import { ultimoMesDoCupom } from "@/lib/cupons";
import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { usoDaFaixa } from "@/lib/faixas";
import { emReais } from "@/lib/dinheiro";
import { dataBR } from "@/lib/datas";
import { opcoesNoCartao, precoDoModulo } from "@/lib/precos";
import { tabelaVigente } from "@/lib/tabela-de-precos";
import { ehFaturaAnual, ehFaturaTrimestral } from "@/lib/cobranca-plataforma";
import { emCortesia } from "@/lib/cobranca";
import { linksDaNota } from "@/lib/nota-da-plataforma";
import { PagarNoCartao } from "@/componentes/PagarNoCartao";
import {
  contaMontada,
  MODULOS_COBRAVEIS,
  PLANO,
  planoExato,
} from "@/lib/planos";
import { ROTULO_DO_MODULO } from "@/lib/rotulos";
import { Estrutura } from "@/componentes/Estrutura";
import { rotuloDoTamanho, type Modulo } from "@/lib/catalogo";

export default async function PaginaDoPlano() {
  // Plano e contrato: quem ve e quem responde pelo escritorio.
  const contexto = await contextoDaPagina();
  const modulos = await modulosAtivos(contexto.escritorioId);

  if (contexto.papel !== "ADMIN") {
    return (
      <Estrutura
        nomeEscritorio={contexto.marca.nome}
        logoUrl={contexto.marca.logoUrl}
        papel={contexto.papel}
      nomeUsuario={contexto.nomeUsuario}
      acesso={contexto.acesso}
        modulos={modulos}
        titulo="Plano"
      >
        <p className="vazio">
          O plano do escritório é visto por quem administra a conta.
        </p>
      </Estrutura>
    );
  }

  const [uso, assinatura, abertas, notasDaAssinatura] = await Promise.all([
    usoDaFaixa(contexto.escritorioId),
    comEscritorio(contexto.escritorioId, (db) => db.assinatura.findFirst()),
    comEscritorio(contexto.escritorioId, (db) =>
      db.fatura.findMany({ where: { status: "ABERTA" }, orderBy: { vencimento: "asc" } }),
    ),
    // Notas fiscais que a Blackbird emitiu para este escritorio (RLS: so as dele).
    comEscritorio(contexto.escritorioId, (db) =>
      db.notaDaPlataforma.findMany({
        where: { status: { in: ["EMITIDA", "CANCELADA"] } },
        orderBy: { emitidaEm: "desc" },
        take: 24,
      }),
    ),
  ]);

  const contratados = modulos.filter(
    (modulo): modulo is Modulo => modulo !== "NUCLEO",
  );
  const plano = planoExato(contratados);
  const tabela = await tabelaVigente();
  const conta = contaMontada(contratados, uso.faixa, tabela);
  const faltando = MODULOS_COBRAVEIS.filter(
    (modulo) => !contratados.includes(modulo),
  );

  // O que vale e o valor fechado na assinatura; a tabela pode ter mudado
  // depois, e contrato assinado nao muda por isso.
  // Zero quer dizer "sem valor fechado": vale a tabela, como na fatura.
  const mensalidade = assinatura?.valorCentavos && assinatura.valorCentavos > 0
    ? assinatura.valorCentavos
    : conta.totalCentavos;
  const anual = assinatura?.ciclo === "ANUAL";
  const trimestral = assinatura?.ciclo === "TRIMESTRAL";
  const isento = emCortesia(assinatura);
  // A tabela de cupons e da plataforma (RLS fechado para o escritorio): o
  // codigo e o desconto vem pelo plano de controle, so do cupom DESTA assinatura.
  const cupom =
    assinatura?.cupomId && (!assinatura.cupomAte || assinatura.cupomAte > new Date())
      ? await prismaPlataforma().cupom.findUnique({
          where: { id: assinatura.cupomId },
          select: { codigo: true, percentual: true, valorCentavos: true },
        })
      : null;
  const emTeste = assinatura && !isento
    ? assinatura.fimDoTeste.getTime() > Date.now()
    : false;

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      nomeUsuario={contexto.nomeUsuario}
      modulos={modulos}
      titulo="Plano do escritório"
      chamada={
        plano
          ? `Plano ${PLANO[plano].rotulo}.`
          : "Plano montado para este escritório."
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="indicador">
          <p className="indicador-numero">
            {isento
              ? "Cortesia"
              : anual
                ? emReais(mensalidade * 12 - Math.round(mensalidade * 12 * tabela.descontoAnual))
                : trimestral
                  ? emReais(mensalidade * 3 - Math.round(mensalidade * 3 * tabela.descontoTrimestral))
                  : emReais(mensalidade)}
          </p>
          <p className="indicador-rotulo">
            {isento
              ? "Sem mensalidade"
              : anual
                ? `Plano anual (${emReais(mensalidade)}/mês com ${percentualEmTexto(tabela.descontoAnual)} de desconto)`
                : trimestral
                  ? `Plano trimestral (${emReais(mensalidade)}/mês com ${percentualEmTexto(tabela.descontoTrimestral)} de desconto)`
                  : "Mensalidade contratada"}
          </p>
        </section>
        <section className="indicador">
          <p className="indicador-numero">
            {uso.advogados.usados}/{uso.advogados.limite}
          </p>
          <p className="indicador-rotulo">
            Advogados ativos · faixa {uso.rotulo}
          </p>
        </section>
        <section className="indicador">
          <p className="indicador-numero">
            {uso.apoio.usados}/{uso.apoio.limite}
          </p>
          <p className="indicador-rotulo">Equipe de apoio ativa</p>
        </section>
      </div>

      {cupom ? (
        <p className="aviso-ok mt-4">
          Cupom {cupom.codigo}: {cupom.percentual != null ? `${cupom.percentual}% de desconto` : `${emReais(cupom.valorCentavos ?? 0)} de desconto por mês`} na
          mensalidade
          {assinatura?.cupomAte ? `, até a fatura de ${ultimoMesDoCupom(assinatura.cupomAte)}` : ""}.
        </p>
      ) : null}

      {isento ? (
        <p className="aviso-ok mt-4">
          Este escritório está em cortesia
          {assinatura?.cortesiaAte ? ` até ${dataBR.format(new Date(assinatura.cortesiaAte.getTime() - 1))}` : ""}: usa o sistema sem custo e
          nenhuma fatura é gerada{assinatura?.cortesiaAte ? " até lá" : ""}.
        </p>
      ) : null}

      {emTeste && assinatura ? (
        <p className="aviso-info mt-4">
          Período de teste até {dataBR.format(assinatura.fimDoTeste)}. A
          primeira fatura só é gerada depois disso.
        </p>
      ) : null}

      {abertas.length > 0 ? (
        <section className="mt-8">
          <h2>Faturas em aberto</h2>
          <ul className="mt-3 grid gap-3">
            {abertas.map((f) => {
              const anual = ehFaturaAnual(f.detalhe);
              const deTrimestre = ehFaturaTrimestral(f.detalhe);
              return (
                <li key={f.id} className="cartao-aperto flex flex-wrap items-center justify-between gap-3">
                  <span>
                    <span className="font-medium">
                      {anual
                        ? `Plano anual a partir de ${f.competencia.split("-").reverse().join("/")}`
                        : deTrimestre
                          ? `Plano trimestral a partir de ${f.competencia.split("-").reverse().join("/")}`
                          : `Mensalidade ${f.competencia.split("-").reverse().join("/")}`}
                    </span>
                    <span className="block text-sm text-slate-500">
                      {emReais(f.valorCentavos)} · vence em {dataBR.format(f.vencimento)}
                      {f.parcelas ? ` · ${f.parcelas > 1 ? `em ${f.parcelas}x` : "a vista"} no cartão, com a tarifa` : ""}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-3">
                    {f.linkPagamento ? (
                      <a className="botao-principal" href={f.linkPagamento} target="_blank" rel="noopener noreferrer">
                        {f.parcelas ? "Pagar no cartão" : "Pagar (boleto ou Pix)"}
                      </a>
                    ) : (
                      <span className="text-sm text-slate-500">Link de pagamento a caminho</span>
                    )}
                    {!f.parcelas && f.linkPagamento ? (
                      <PagarNoCartao faturaId={f.id} opcoes={opcoesNoCartao(f.valorCentavos, anual)} />
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="ajuda">
            A baixa é automática: depois de pagar, não é preciso mandar comprovante.
          </p>
        </section>
      ) : null}

      {notasDaAssinatura.length > 0 ? (
        <section className="mt-8">
          <h2>Notas fiscais da assinatura</h2>
          <ul className="mt-3 grid gap-2">
            {notasDaAssinatura.map((n) => {
              const links = linksDaNota(n.id);
              return (
                <li key={n.id} className="cartao-aperto flex flex-wrap items-center justify-between gap-3">
                  <span>
                    <span className="font-medium">
                      Nota {n.numeroNaPrefeitura ?? n.numero}
                      {n.status === "CANCELADA" ? " (cancelada)" : ""}
                      {n.ambiente !== "PRODUCAO" ? " (teste, sem valor fiscal)" : ""}
                    </span>
                    <span className="block text-sm text-slate-500">
                      {emReais(n.valorCentavos)}
                      {n.emitidaEm ? ` · emitida em ${dataBR.format(n.emitidaEm)}` : ""}
                    </span>
                  </span>
                  <span className="flex gap-3 text-sm">
                    <a className="underline" href={links.pdf} target="_blank" rel="noopener noreferrer">PDF</a>
                    <a className="underline" href={links.xml}>XML</a>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2>O que está contratado</h2>
        <div className="cartao mt-3 overflow-x-auto p-0">
          <table className="tabela">
            <thead>
              <tr>
                <th>Módulo</th>
                <th className="text-right">Na tabela de hoje</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span className="font-medium">Sistema</span>
                  <span className="block text-slate-500">
                    Clientes, processos, agenda e prazos ·{" "}
                    {rotuloDoTamanho(uso.faixa)}
                  </span>
                </td>
                <td className="text-right tabular-nums">
                  {emReais(conta.faixaCentavos)}
                </td>
              </tr>
              {conta.modulos.map((linha) => (
                <tr key={linha.modulo}>
                  <td className="font-medium">
                    {ROTULO_DO_MODULO[linha.modulo]}
                  </td>
                  <td className="text-right tabular-nums">
                    {emReais(linha.valorCentavos)}
                  </td>
                </tr>
              ))}
              {conta.descontoCentavos > 0 && conta.plano ? (
                <tr>
                  <td className="destaque">
                    Desconto do plano {PLANO[conta.plano].rotulo}
                  </td>
                  <td className="destaque text-right tabular-nums">
                    − {emReais(conta.descontoCentavos)}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="ajuda">
          Esta coluna é a tabela vigente. O que o escritório paga é o valor
          fechado na assinatura, acima — mudança de tabela não altera contrato
          assinado.
        </p>
      </section>

      {faltando.length > 0 ? (
        <section className="mt-8">
          <h2>O que dá para acrescentar</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {faltando.map((modulo) => (
              <li
                key={modulo}
                className="cartao-aperto flex items-baseline justify-between gap-3"
              >
                <span className="font-medium">{ROTULO_DO_MODULO[modulo]}</span>
                <span className="shrink-0 text-sm text-slate-500">
                  + {emReais(precoDoModulo(modulo, uso.faixa, tabela))}/mes
                </span>
              </li>
            ))}
          </ul>
          <p className="ajuda">
            Contratar ou cancelar módulo é mudança de contrato: fale com quem
            atende o escritório na plataforma. O sistema não liga módulo
            sozinho.
          </p>
        </section>
      ) : (
        <p className="aviso-ok mt-8">
          Este escritório está no plano mais completo: todos os módulos da
          plataforma estão contratados.
        </p>
      )}
    </Estrutura>
  );
}
