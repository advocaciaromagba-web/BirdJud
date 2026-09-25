import Link from "next/link";
import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { Estrutura } from "@/componentes/Estrutura";
import { FormularioCriar } from "@/componentes/FormularioCriar";

export default async function PaginaClientes() {
  const contexto = await contextoDaPagina();

  const modulos = await modulosAtivos(contexto.escritorioId);
  const clientes = await comEscritorio(contexto.escritorioId, (db) =>
    db.cliente.findMany({
      orderBy: { nome: "asc" },
      take: 200,
      include: { _count: { select: { processos: true } } },
    }),
  );

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      modulos={modulos}
      titulo="Clientes"
      chamada={`${clientes.length} cadastrado(s).`}
    >
      <FormularioCriar
        rota="/api/clientes"
        recolhivel
        textoAbrir="Novo cliente"
        textoBotao="Cadastrar cliente"
        leitura={modulos.includes("IA") ? "CLIENTE" : undefined}
        campos={[
          { nome: "nome", rotulo: "Nome", obrigatorio: true, largo: true },
          { nome: "documento", rotulo: "CPF / CNPJ" },
          { nome: "telefone", rotulo: "Telefone" },
          { nome: "email", rotulo: "E-mail", tipo: "email" },
        ]}
      />

      {clientes.length === 0 ? (
        <p className="vazio mt-6">
          Nenhum cliente cadastrado ainda. Comece pelo botao acima — depois cada
          processo, cobranca e arquivo se pendura no cliente.
        </p>
      ) : (
        <div className="cartao mt-6 overflow-x-auto p-0">
          <table className="tabela">
            <thead>
              <tr>
                <th>Nome</th>
                <th>CPF / CNPJ</th>
                <th>Contato</th>
                <th className="text-right">Processos</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((cliente) => (
                <tr key={cliente.id}>
                  <td className="font-medium">
                    <Link
                      href={`/busca?q=${encodeURIComponent(cliente.nome)}`}
                      className="hover:underline"
                    >
                      {cliente.nome}
                    </Link>
                  </td>
                  <td className="text-slate-600">{cliente.documento ?? "—"}</td>
                  <td className="text-slate-600">
                    {[cliente.telefone, cliente.email]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                  <td className="text-right tabular-nums">
                    {cliente._count.processos}
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
