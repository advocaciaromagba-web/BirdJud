import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { dataBR } from "@/lib/datas";
import { modulosAtivos, ModuloNaoContratado } from "@/lib/modulos";
import { emReais } from "@/lib/dinheiro";
import { Estrutura } from "@/componentes/Estrutura";
import { FormularioCriar } from "@/componentes/FormularioCriar";
import {
  ListaCobrancas,
  type CobrancaNaTela,
} from "@/componentes/ListaCobrancas";

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
        take: 200,
        include: { cliente: { select: { nome: true } } },
      }),
      clientes: await db.cliente.findMany({
        orderBy: { nome: "asc" },
        select: { id: true, nome: true, documento: true },
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
    cliente: c.cliente.nome,
    descricao: c.descricao,
    valor: emReais(c.valorPagoCentavos ?? c.valorCentavos),
    vencimento: data.format(c.vencimento),
    forma: c.forma,
    status: c.status,
    linkPagamento: c.linkPagamento,
    pagoEm: c.pagoEm ? data.format(c.pagoEm) : null,
  }));

  const emAberto = dados.cobrancas
    .filter((c) => c.status === "ABERTA" || c.status === "VENCIDA")
    .reduce((total, c) => total + c.valorCentavos, 0);

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
        escritorio
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
            O Asaas exige CPF/CNPJ do cliente. Cliente sem documento cadastrado
            é recusado com essa mensagem.
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
                tipo: "select",
                obrigatorio: true,
                opcoes: dados.clientes.map((cliente) => ({
                  valor: cliente.id,
                  rotulo: cliente.documento
                    ? cliente.nome
                    : `${cliente.nome} (sem CPF/CNPJ)`,
                })),
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
            ]}
            textoBotao="Emitir cobrança"
          />
        </details>
      ) : (
        <div className="mt-4 rounded border border-slate-300 p-4 text-sm text-slate-600">
          Cadastre um cliente antes de emitir cobrança.
        </div>
      )}

      <ListaCobrancas cobrancas={cobrancas} />
    </Estrutura>
  );
}
