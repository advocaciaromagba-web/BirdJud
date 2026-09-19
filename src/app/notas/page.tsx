import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos, ModuloNaoContratado } from "@/lib/modulos";
import { emReais } from "@/lib/dinheiro";
import { Navegacao } from "@/componentes/Navegacao";
import { PainelNotas, type NotaNaTela } from "@/componentes/PainelNotas";

export default async function PaginaNotas() {
  let contexto;
  try {
    contexto = await contextoDaPagina("NFSE");
  } catch (erro) {
    if (erro instanceof ModuloNaoContratado) {
      return (
        <main className="mx-auto max-w-2xl p-10">
          <h1 className="text-2xl font-bold">Modulo nao contratado</h1>
          <p className="mt-3 text-neutral-600">
            O modulo de notas fiscais nao faz parte do plano deste escritorio.
          </p>
        </main>
      );
    }
    throw erro;
  }

  const [modulos, dados] = await Promise.all([
    modulosAtivos(contexto.escritorioId),
    comEscritorio(contexto.escritorioId, async (db) => ({
      notas: await db.notaFiscal.findMany({
        orderBy: { criadoEm: "desc" },
        take: 200,
        include: { cliente: { select: { nome: true } } },
      }),
      clientes: await db.cliente.findMany({
        orderBy: { nome: "asc" },
        select: { id: true, nome: true, documento: true },
      }),
      fiscal: await db.fiscal.findFirst(),
      temCertificado: await db.integracao.count({ where: { tipo: "NFSE_CERT" } }),
    })),
  ]);

  const data = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

  const notas: NotaNaTela[] = dados.notas.map((nota) => ({
    id: nota.id,
    numero: `${nota.serie}/${nota.numero}`,
    cliente: nota.cliente?.nome ?? "—",
    descricao: nota.descricao,
    valor: emReais(nota.valorCentavos),
    status: nota.status,
    data: data.format(nota.criadoEm),
    chaveAcesso: nota.chaveAcesso,
    linkPdf: nota.linkPdf,
    erro: nota.erro,
  }));

  return (
    <>
      <Navegacao nomeEscritorio={contexto.marca.nome} papel={contexto.papel} modulos={modulos} />
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold">Notas fiscais</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {dados.fiscal
            ? `Serie ${dados.fiscal.serie} · proxima nota ${dados.fiscal.proximoNumero} · ambiente ${dados.fiscal.ambiente}`
            : "Cadastro fiscal ainda nao preenchido"}
        </p>

        {dados.fiscal?.ambiente === "HOMOLOGACAO" ? (
          <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm">
            Ambiente de <strong>homologacao</strong>: as notas emitidas aqui servem para
            conferir o cadastro e nao tem valor fiscal. Troque para producao quando o
            contador conferir os dados.
          </div>
        ) : null}

        {dados.temCertificado === 0 ? (
          <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm">
            O certificado e-CNPJ ainda nao foi enviado. Sem ele nao ha assinatura, e sem
            assinatura nao ha nota: cadastre em Integracoes.
          </div>
        ) : null}

        <PainelNotas
          notas={notas}
          clientes={dados.clientes.map((c) => ({
            id: c.id,
            nome: c.nome,
            temDocumento: Boolean(c.documento),
          }))}
          fiscal={
            dados.fiscal
              ? {
                  razaoSocial: dados.fiscal.razaoSocial,
                  cnpj: dados.fiscal.cnpj,
                  inscricaoMunicipal: dados.fiscal.inscricaoMunicipal,
                  codigoMunicipio: dados.fiscal.codigoMunicipio,
                  regime: dados.fiscal.regime,
                  codigoTributacao: dados.fiscal.codigoTributacao,
                  aliquota: (dados.fiscal.aliquotaMilesimos / 1000).toString(),
                  serie: dados.fiscal.serie,
                  ambiente: dados.fiscal.ambiente,
                }
              : null
          }
          podeConfigurar={contexto.papel === "ADMIN"}
        />
      </main>
    </>
  );
}
