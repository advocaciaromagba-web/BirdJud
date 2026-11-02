import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { dataBR } from "@/lib/datas";
import { modulosAtivos, ModuloNaoContratado } from "@/lib/modulos";
import { emReais } from "@/lib/dinheiro";
import { Estrutura } from "@/componentes/Estrutura";
import { FormularioCriar } from "@/componentes/FormularioCriar";
import { PainelMensalidades } from "@/componentes/PainelMensalidades";
import { CICLOS, NOMES_DOS_CICLOS, type Ciclo } from "@/lib/mensalidades";
import { PainelCobrancas, type CobrancaNaTela } from "@/componentes/PainelCobrancas";
import { ListaFinanceira } from "@/componentes/ListaFinanceira";
import { contextoProtegido } from "@/lib/pagina";
import Link from "next/link";

export default async function PaginaCobrancas() {
  let contexto;
  try {
    contexto = await contextoDaPagina("COBRANCAS", "COBRANCAS");
  } catch (erro) {
    if (erro instanceof ModuloNaoContratado) {
      return (
        <main className="mx-auto max-w-2xl p-10">
          <h1 className="text-2xl font-bold">Módulo não contratado</h1>
          <p className="mt-3 text-slate-600">
            O módulo Cobranças não faz parte do plano deste escritório.
          </p>
        </main>
      );
    }
    throw erro;
  }

  const [modulos, dados] = await Promise.all([
    modulosAtivos(contexto.escritorioId),
    comEscritorio(contexto.escritorioId, async (db) => ({
      cobrancas: await db.cobranca.findMany({
        orderBy: [{ vencimento: "asc" }],
        take: 500,
        include: {
          cliente: { select: { nome: true } },
          baixas: { orderBy: { data: "asc" } },
        },
      }),
      clientes: await db.cliente.findMany({
        orderBy: { nome: "asc" },
        select: { id: true, nome: true, documento: true },
      }),
      equipe: await db.usuario.findMany({ where: { ativo: true }, select: { nome: true }, orderBy: { nome: "asc" } }),
      mensalidades: await db.mensalidade.findMany({
        orderBy: [{ status: "asc" }, { proximoVencimento: "asc" }],
        include: { cliente: { select: { nome: true } } },
      }),
      contaConectada: await db.integracao.count({
        where: { tipo: "ASAAS", status: "OK" },
      }),
      infinitePayConectada: await db.integracao.count({
        where: { tipo: "INFINITEPAY" },
      }),
    })),
  ]);

  // Com as duas contas, quem emite escolhe na hora. Com uma so, nao ha o que
  // perguntar — e um campo a menos para alguem errar.
  const temInfinitePay = dados.infinitePayConectada > 0;

  const data = dataBR;

  const cobrancas: CobrancaNaTela[] = dados.cobrancas.map((c) => ({
    id: c.id,
    clienteId: c.clienteId,
    cliente: c.cliente.nome,
    descricao: c.descricao,
    valorCentavos: c.valorCentavos,
    recebidoCentavos: c.status === "PAGA" ? c.valorCentavos : c.baixas.reduce((t, b) => t + b.valorCentavos, 0),
    vencimentoISO: c.vencimento.toISOString(),
    forma: c.forma,
    status: c.status,
    provedor: c.provedor,
    linkPagamento: c.linkPagamento,
    pagoEm: c.pagoEm ? data.format(c.pagoEm) : null,
    parcela: c.parcelaNumero && c.parcelaTotal ? `parcela ${c.parcelaNumero} de ${c.parcelaTotal}` : null,
    deMensalidade: Boolean(c.mensalidadeId),
    baixas: c.baixas.map((b) => ({
      id: b.id,
      valor: emReais(b.valorCentavos),
      data: data.format(b.data),
      observacao: b.observacao,
      registradoPor: b.registradoPor,
      forma: b.forma,
      recebidoPor: b.recebidoPor,
    })),
  }));

  const agora = new Date();
  const faltaDe = (c: (typeof dados.cobrancas)[number]) => c.valorCentavos - c.baixas.reduce((t, b) => t + b.valorCentavos, 0);
  const abertasAgora = dados.cobrancas.filter((c) => c.status === "ABERTA" || c.status === "VENCIDA" || c.status === "PARCIAL");
  const emAberto = abertasAgora.reduce((total, c) => total + faltaDe(c), 0);
  const vencido = abertasAgora.filter((c) => c.vencimento < agora).reduce((total, c) => total + faltaDe(c), 0);
  const trintaDias = new Date(agora.getTime() - 30 * 86_400_000);
  const recebido30 =
    dados.cobrancas.filter((c) => c.status === "PAGA" && c.pagoEm && c.pagoEm >= trintaDias).reduce((t, c) => t + (c.valorPagoCentavos ?? c.valorCentavos), 0) +
    dados.cobrancas
      .filter((c) => c.status === "PARCIAL")
      .flatMap((c) => c.baixas)
      .filter((b) => b.data >= trintaDias)
      .reduce((t, b) => t + b.valorCentavos, 0);

  // A pagar mora no Financeiro, atras da segunda senha: a aba aqui mostra o
  // mesmo conteudo so com a porta destrancada — nunca mais facil de abrir que
  // a tela de onde ele vem.
  let aPagar: React.ReactNode;
  if (!modulos.includes("FINANCEIRO")) {
    aPagar = <p className="text-sm text-slate-600">Contas a pagar fazem parte do módulo Financeiro, que não está no plano.</p>;
  } else {
    const porta = await contextoProtegido("FINANCEIRO").catch(() => null);
    if (!porta || porta.tranca) {
      aPagar = (
        <p className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          As contas a pagar ficam no Financeiro, protegido pela segunda senha.{" "}
          <Link href="/financeiro" className="text-marca underline">
            Destrancar o Financeiro
          </Link>
          {" "}e voltar: enquanto ele estiver destrancado, as contas aparecem aqui.
        </p>
      );
    } else {
      const limite = new Date(agora.getTime() + 45 * 86_400_000);
      const contas = await comEscritorio(contexto.escritorioId, (db) =>
        db.lancamento.findMany({
          where: { tipo: "DESPESA", pagoEm: null, OR: [{ vencimento: null }, { vencimento: { lte: limite } }] },
          orderBy: [{ vencimento: "asc" }],
          take: 200,
        }),
      );
      aPagar = (
        <div>
          <p className="mb-3 text-sm text-slate-600">
            Despesas em aberto vencidas e dos próximos 45 dias. Lançar despesa nova e custo fixo:{" "}
            <Link href="/financeiro" className="text-marca underline">
              Financeiro
            </Link>
            .
          </p>
          <ListaFinanceira
            lancamentos={contas.map((l) => ({
              ...l,
              vencimento: l.vencimento?.toISOString() ?? null,
              pagoEm: l.pagoEm?.toISOString() ?? null,
            }))}
          />
        </div>
      );
    }
  }

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      nomeUsuario={contexto.nomeUsuario}
      acesso={contexto.acesso}
      modulos={modulos}
      titulo="Cobranças"
    >
      <p className="mt-1 text-sm text-slate-500">
        {emReais(emAberto)} em aberto · cobrança na conta Asaas do próprio
        escritório
        {/* Sem o modulo Financeiro nao ha aba onde a conferencia more. */}
        {!modulos.includes("FINANCEIRO") && contexto.acesso.CONCILIACAO ? (
          <>
            {" · "}
            <a href="/conciliacao" className="text-marca underline">
              conferir o extrato
            </a>
          </>
        ) : null}
      </p>

      {dados.contaConectada === 0 ? (
        <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm">
          A conta Asaas ainda não está conectada. Cadastre a chave de API em
          Integrações: sem ela não dá para emitir cobrança.
        </div>
      ) : null}

      {dados.clientes.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-marca">
            Nova cobrança
          </summary>
          <p className="mt-2 text-sm text-slate-500">
            O Asaas exige CPF/CNPJ do cliente. Se o cliente escolhido não tiver,
            o campo aparece aqui mesmo e o número vai para o cadastro.
            {temInfinitePay
              ? " Na InfinitePay sai um link com Pix e cartão, e quem escolhe é o cliente no checkout — a forma abaixo só vale para o Asaas."
              : ""}
          </p>
          <FormularioCriar
            rota="/api/cobrancas"
            campos={[
              {
                nome: "clienteId",
                rotulo: "Cliente",
                tipo: "clienteExistente",
                obrigatorio: true,
                largo: true,
                opcoes: dados.clientes.map((cliente) => ({
                  valor: cliente.id,
                  rotulo: cliente.nome,
                  documento: cliente.documento,
                })),
              },
              {
                nome: "documentoDoCliente",
                rotulo: "CPF/CNPJ do cliente",
                obrigatorio: true,
                largo: true,
                seClienteSemDocumento: "clienteId",
                ajuda: "Este cliente está sem CPF/CNPJ, que o Asaas exige. O número é gravado no cadastro dele e vale para todas as telas.",
              },
              ...(temInfinitePay
                ? [
                    {
                      nome: "provedor",
                      rotulo: "Conta",
                      tipo: "select" as const,
                      obrigatorio: true,
                      opcoes: [
                        { valor: "ASAAS", rotulo: "Asaas — boleto, Pix ou cartão" },
                        {
                          valor: "INFINITEPAY",
                          rotulo: "InfinitePay — link com Pix ou cartão",
                        },
                      ],
                    },
                  ]
                : []),
              { nome: "descricao", rotulo: "Descrição", obrigatorio: true },
              { nome: "valor", rotulo: "Valor (R$)", obrigatorio: true },
              {
                nome: "vencimento",
                rotulo: "Vencimento",
                tipo: "date",
                obrigatorio: true,
              },
              {
                nome: "forma",
                rotulo: "Forma",
                tipo: "select",
                obrigatorio: true,
                opcoes: [
                  { valor: "QUALQUER", rotulo: "Cliente escolhe" },
                  { valor: "BOLETO", rotulo: "Boleto" },
                  { valor: "PIX", rotulo: "Pix" },
                  { valor: "CARTAO", rotulo: "Cartão" },
                ],
              },
              {
                nome: "parcelas",
                rotulo: "Parcelas",
                tipo: "select",
                opcoes: Array.from({ length: 24 }, (_, i) => ({
                  valor: String(i + 1),
                  rotulo: i === 0 ? "À vista (uma cobrança)" : `${i + 1} parcelas, a cada 30 dias`,
                })),
                ajuda: "Parcelada: o Asaas gera uma cobrança por parcela, e cada uma aparece na lista.",
              },
              {
                nome: "valorRefereA",
                rotulo: "O valor digitado é",
                tipo: "select",
                opcoes: [
                  { valor: "TOTAL", rotulo: "O total (dividido entre as parcelas)" },
                  { valor: "PARCELA", rotulo: "O de cada parcela" },
                ],
                ajuda: "Só vale com mais de uma parcela. No total, a sobra de centavos vai na última.",
              },
            ]}
            textoBotao="Emitir cobrança"
          />
        </details>
      ) : (
        <div className="mt-4 rounded border border-slate-300 p-4 text-sm text-slate-600">
          Cadastre um cliente antes de emitir cobrança.
        </div>
      )}

      {dados.contaConectada > 0 || dados.mensalidades.length > 0 ? (
        <PainelMensalidades
          mensalidades={dados.mensalidades.map((m) => ({
            id: m.id,
            cliente: m.cliente.nome,
            descricao: m.descricao,
            valor: emReais(m.valorCentavos),
            ciclo: CICLOS[m.ciclo as Ciclo]?.rotulo ?? m.ciclo,
            proximoVencimento: data.format(m.proximoVencimento),
            status: m.status,
            importada: m.importada,
            motivoEncerramento: m.motivoEncerramento,
          }))}
          clientes={dados.clientes.map((c) => ({ id: c.id, nome: c.nome, documento: c.documento }))}
          ciclos={NOMES_DOS_CICLOS.map((c) => ({ valor: c, rotulo: CICLOS[c].rotulo }))}
          podeEditarCliente={contexto.acesso.CLIENTES === true}
        />
      ) : null}

      <PainelCobrancas cobrancas={cobrancas} resumo={{ emAberto, vencido, recebido30 }} aPagar={aPagar} equipe={dados.equipe.map((u) => u.nome)} />
    </Estrutura>
  );
}
