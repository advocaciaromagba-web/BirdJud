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
    contexto = await contextoDaPagina("COBRANCAS");
  } catch (erro) {
    if (erro instanceof ModuloNaoContratado) {
      return (
        <main className="mx-auto max-w-2xl p-10">
          <h1 className="text-2xl font-bold">Modulo nao contratado</h1>
          <p className="mt-3 text-slate-600">
            O modulo Cobrancas nao faz parte do plano deste escritorio.
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
    })),
  ]);

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
      modulos={modulos}
      titulo="Cobrancas"
    >
      <p className="mt-1 text-sm text-slate-500">
        {emReais(emAberto)} em aberto · cobranca na conta Asaas do proprio
        escritorio
      </p>

      {dados.contaConectada === 0 ? (
        <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm">
          A conta Asaas ainda nao esta conectada. Cadastre a chave de API em
          Integracoes: sem ela nao da para emitir cobranca.
        </div>
      ) : null}

      {dados.clientes.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-marca">
            Nova cobranca
          </summary>
          <p className="mt-2 text-sm text-slate-500">
            O Asaas exige CPF/CNPJ do cliente. Cliente sem documento cadastrado
            e recusado com essa mensagem.
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
              { nome: "descricao", rotulo: "Descricao", obrigatorio: true },
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
                  { valor: "CARTAO", rotulo: "Cartao" },
                ],
              },
            ]}
            textoBotao="Emitir cobranca"
          />
        </details>
      ) : (
        <div className="mt-4 rounded border border-slate-300 p-4 text-sm text-slate-600">
          Cadastre um cliente antes de emitir cobranca.
        </div>
      )}

      <ListaCobrancas cobrancas={cobrancas} />
    </Estrutura>
  );
}
