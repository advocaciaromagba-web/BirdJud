import Link from "next/link";
import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { Estrutura } from "@/componentes/Estrutura";
import { FormularioCriar } from "@/componentes/FormularioCriar";
import { formatarNumeroProcesso } from "@/lib/leitura-publicacao";
import { dataBR } from "@/lib/datas";
import { PartesDoProcesso } from "@/componentes/PartesDoProcesso";

export default async function PaginaProcessos({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const contexto = await contextoDaPagina(undefined, "PROCESSOS");

  const modulos = await modulosAtivos(contexto.escritorioId);
  const { filtro } = await searchParams;
  const semCliente = filtro === "sem-cliente";
  const { processos, clientes, total, totalSemCliente } = await comEscritorio(
    contexto.escritorioId,
    async (db) => ({
      // Mais recente movimentacao primeiro: e o processo que pede atencao.
      processos: await db.processo.findMany({
        where: semCliente ? { clienteId: null } : undefined,
        orderBy: [{ ultimoAndamentoEm: { sort: "desc", nulls: "last" } }, { criadoEm: "desc" }],
        take: 500,
        include: { cliente: { select: { id: true, nome: true } } },
      }),
      total: await db.processo.count(),
      totalSemCliente: await db.processo.count({ where: { clienteId: null } }),
      clientes: await db.cliente.findMany({
        orderBy: { nome: "asc" },
        take: 500,
      }),
    }),
  );

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      nomeUsuario={contexto.nomeUsuario}
      acesso={contexto.acesso}
      modulos={modulos}
      titulo="Processos"
      chamada={`${total} cadastrado(s)${totalSemCliente ? ` · ${totalSemCliente} sem cliente` : ""}. Os processos das OABs do escritorio entram sozinhos pelo DJEN.`}
    >
      <nav className="mt-3 flex flex-wrap gap-2 text-sm" aria-label="Filtro">
        <Link
          href="/processos"
          className={`rounded-lg px-3 py-1.5 ${!semCliente ? "bg-slate-900 font-semibold text-white" : "text-slate-700 hover:bg-slate-100"}`}
        >
          Todos ({total})
        </Link>
        <Link
          href="/processos?filtro=sem-cliente"
          className={`rounded-lg px-3 py-1.5 ${semCliente ? "bg-slate-900 font-semibold text-white" : "text-slate-700 hover:bg-slate-100"}`}
        >
          Sem cliente ({totalSemCliente})
        </Link>
      </nav>
      <FormularioCriar
        rota="/api/processos"
        recolhivel
        textoAbrir="Novo processo"
        textoBotao="Cadastrar processo"
        leitura={modulos.includes("IA") ? "PROCESSO" : undefined}
        campos={[
          {
            nome: "numero",
            rotulo: "Numero do processo",
            obrigatorio: true,
            ajuda: "Numero unico do CNJ, com ou sem mascara.",
          },
          {
            nome: "clienteId",
            rotulo: "Cliente",
            tipo: "select",
            opcoes: clientes.map((c) => ({ valor: c.id, rotulo: c.nome })),
          },
          { nome: "tribunal", rotulo: "Tribunal" },
          { nome: "vara", rotulo: "Vara" },
          { nome: "area", rotulo: "Area" },
        ]}
      />

      {processos.length === 0 ? (
        <p className="vazio mt-6">
          Nenhum processo cadastrado ainda. Cadastre o primeiro para que as
          publicacoes capturadas encontrem onde se prender.
        </p>
      ) : (
        <div className="cartao mt-6 overflow-x-auto p-0">
          <table className="tabela">
            <thead>
              <tr>
                <th>Numero</th>
                <th>Cliente</th>
                <th>Partes</th>
                <th>Ultimo andamento</th>
                <th>Tribunal / vara</th>
              </tr>
            </thead>
            <tbody>
              {processos.map((processo) => (
                <tr key={processo.id}>
                  <td className="font-medium">
                    <Link
                      href={`/processos/${processo.id}`}
                      className="hover:underline"
                    >
                      {formatarNumeroProcesso(processo.numero)}
                    </Link>
                    {processo.classe ? <div className="text-xs font-normal text-slate-500">{processo.classe}</div> : null}
                    {processo.situacao !== "ATIVO" ? (
                      <div className="text-xs font-normal text-slate-500">{processo.situacao.toLowerCase()}</div>
                    ) : null}
                  </td>
                  <td className="text-slate-600">
                    {processo.cliente ? (
                      <Link href={`/clientes/${processo.cliente.id}`} className="hover:underline">
                        {processo.cliente.nome}
                      </Link>
                    ) : (
                      <span className="text-xs text-amber-700">sem cliente</span>
                    )}
                  </td>
                  <td className="min-w-[12rem]">
                    <PartesDoProcesso
                      processoId={processo.id}
                      partes={Array.isArray(processo.partes) ? (processo.partes as { nome: string; polo: string | null }[]) : []}
                      temCliente={processo.clienteId !== null}
                    />
                  </td>
                  <td className="min-w-[14rem] text-xs text-slate-600">
                    {processo.ultimoAndamentoEm ? (
                      <>
                        <span className="font-semibold text-slate-800">{dataBR.format(processo.ultimoAndamentoEm)}</span>
                        {processo.ultimoAndamentoTipo ? ` · ${processo.ultimoAndamentoTipo}` : ""}
                        {processo.ultimoAndamentoTexto ? (
                          <span className="mt-0.5 block line-clamp-2">{processo.ultimoAndamentoTexto}</span>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-slate-600">
                    {[processo.tribunal, processo.vara]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Estrutura>
  );
}
