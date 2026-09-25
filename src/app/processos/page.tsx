import Link from "next/link";
import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { Estrutura } from "@/componentes/Estrutura";
import { FormularioCriar } from "@/componentes/FormularioCriar";
import { formatarNumeroProcesso } from "@/lib/leitura-publicacao";

export default async function PaginaProcessos() {
  const contexto = await contextoDaPagina();

  const modulos = await modulosAtivos(contexto.escritorioId);
  const { processos, clientes } = await comEscritorio(
    contexto.escritorioId,
    async (db) => ({
      processos: await db.processo.findMany({
        orderBy: { criadoEm: "desc" },
        take: 200,
        include: { cliente: { select: { nome: true } } },
      }),
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
      modulos={modulos}
      titulo="Processos"
      chamada={`${processos.length} cadastrado(s).`}
    >
      <FormularioCriar
        rota="/api/processos"
        recolhivel
        textoAbrir="Novo processo"
        textoBotao="Cadastrar processo"
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
                <th>Tribunal / vara</th>
                <th>Situacao</th>
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
                  </td>
                  <td className="text-slate-600">
                    {processo.cliente?.nome ?? "—"}
                  </td>
                  <td className="text-slate-600">
                    {[processo.tribunal, processo.vara]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                  <td>
                    <span
                      className={
                        processo.situacao === "ATIVO"
                          ? "etiqueta-ok"
                          : "etiqueta-neutra"
                      }
                    >
                      {processo.situacao.toLowerCase()}
                    </span>
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
