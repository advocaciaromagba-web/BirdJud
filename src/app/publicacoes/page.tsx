import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { dataBR } from "@/lib/datas";
import { modulosAtivos, ModuloNaoContratado } from "@/lib/modulos";
import { formatarNumeroProcesso } from "@/lib/leitura-publicacao";
import { Navegacao } from "@/componentes/Navegacao";
import { FormularioCriar } from "@/componentes/FormularioCriar";
import { ListaPublicacoes, type PublicacaoNaTela } from "@/componentes/ListaPublicacoes";

const UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB",
  "PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

export default async function PaginaPublicacoes() {
  let contexto;
  try {
    contexto = await contextoDaPagina("PUBLICACOES_DJEN");
  } catch (erro) {
    if (erro instanceof ModuloNaoContratado) {
      return (
        <main className="mx-auto max-w-2xl p-10">
          <h1 className="text-2xl font-bold">Modulo nao contratado</h1>
          <p className="mt-3 text-neutral-600">
            O modulo Publicacoes nao faz parte do plano deste escritorio.
          </p>
        </main>
      );
    }
    throw erro;
  }

  const [modulos, dados] = await Promise.all([
    modulosAtivos(contexto.escritorioId),
    comEscritorio(contexto.escritorioId, async (db) => ({
      publicacoes: await db.publicacao.findMany({
        where: { arquivada: false },
        orderBy: [{ urgente: "desc" }, { dataDisponibilizacao: "desc" }],
        take: 200,
        include: {
          analises: {
            where: { tipo: "ANALISE_PUBLICACAO" },
            orderBy: { criadoEm: "desc" },
            take: 1,
          },
        },
      }),
      oabs: await db.oabMonitorada.findMany({ orderBy: { criadoEm: "asc" } }),
      naoLidas: await db.publicacao.count({ where: { arquivada: false, lida: false } }),
    })),
  ]);

  const data = dataBR;

  const publicacoes: PublicacaoNaTela[] = dados.publicacoes.map((p) => ({
    id: p.id,
    numeroProcesso: p.numeroProcesso,
    numeroFormatado: p.numeroProcesso ? formatarNumeroProcesso(p.numeroProcesso) : null,
    temProcesso: p.processoId !== null,
    tribunal: p.tribunal,
    orgao: p.orgao,
    tipoComunicacao: p.tipoComunicacao,
    texto: p.texto,
    link: p.link,
    oab: p.oab,
    data: data.format(p.dataDisponibilizacao),
    urgente: p.urgente,
    prazoDias: p.prazoDias,
    lida: p.lida,
    temIA: modulos.includes("IA"),
    analise: p.analises[0]?.resultado ?? null,
  }));

  return (
    <>
      <Navegacao nomeEscritorio={contexto.marca.nome} papel={contexto.papel} modulos={modulos} />
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold">Publicacoes</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {dados.naoLidas} nao lida(s) · {dados.oabs.filter((o) => o.ativo).length} OAB(s)
          monitorada(s) · fonte: DJEN
        </p>

        {dados.oabs.length === 0 ? (
          <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm">
            Nenhuma OAB monitorada ainda. Sem OAB cadastrada, nao ha o que capturar.
          </div>
        ) : null}

        {contexto.papel === "ADMIN" ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-marca">
              OABs monitoradas ({dados.oabs.length})
            </summary>
            <ul className="mt-3 divide-y divide-neutral-200 text-sm">
              {dados.oabs.map((oab) => (
                <li key={oab.id} className="flex justify-between gap-3 py-2">
                  <span>
                    <span className="font-semibold">
                      {oab.numero}/{oab.uf}
                    </span>
                    {oab.nomeAdvogado ? (
                      <span className="block text-neutral-500">{oab.nomeAdvogado}</span>
                    ) : null}
                  </span>
                  <span className="text-neutral-500">
                    {oab.ultimaCaptura
                      ? `capturada em ${data.format(oab.ultimaCaptura)}`
                      : "ainda nao capturada"}
                  </span>
                </li>
              ))}
            </ul>
            <FormularioCriar
              rota="/api/oabs"
              campos={[
                { nome: "numero", rotulo: "Numero da OAB", obrigatorio: true },
                {
                  nome: "uf",
                  rotulo: "UF",
                  tipo: "select",
                  obrigatorio: true,
                  opcoes: UFS.map((uf) => ({ valor: uf, rotulo: uf })),
                },
                { nome: "nomeAdvogado", rotulo: "Advogado (opcional)" },
              ]}
              textoBotao="Monitorar OAB"
            />
          </details>
        ) : null}

        <ListaPublicacoes publicacoes={publicacoes} />
      </main>
    </>
  );
}
