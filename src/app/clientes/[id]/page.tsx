import Link from "next/link";
import { notFound } from "next/navigation";
import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { dataBR } from "@/lib/datas";
import { tamanhoLegivel } from "@/lib/arquivos";
import { formatarNumeroProcesso } from "@/lib/leitura-publicacao";
import { pendenciasDoCliente } from "@/lib/clientes";
import { Estrutura } from "@/componentes/Estrutura";
import { FichaDoCliente } from "@/componentes/FichaDoCliente";

const COR = {
  IMPEDE: "border-l-red-500 bg-red-50 text-red-900",
  LIMITA: "border-l-amber-500 bg-amber-50 text-amber-900",
  AVISO: "border-l-slate-300 bg-slate-50 text-slate-700",
} as const;

export default async function FichaCliente({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const contexto = await contextoDaPagina();
  const { id } = await params;

  const modulos = await modulosAtivos(contexto.escritorioId);
  const cliente = await comEscritorio(contexto.escritorioId, (db) =>
    db.cliente.findFirst({
      where: { id },
      include: {
        arquivos: { orderBy: { criadoEm: "desc" }, take: 50 },
        processos: {
          orderBy: { criadoEm: "desc" },
          take: 50,
          select: { id: true, numero: true, tribunal: true, vara: true, situacao: true },
        },
        _count: { select: { cobrancas: true, compromissos: true } },
      },
    }),
  );
  // Cliente de outro escritorio nao e "proibido", e inexistente: a extensao
  // ja filtrou. Dizer "proibido" contaria que aquele id existe em algum lugar.
  if (!cliente) notFound();

  const pendencias = pendenciasDoCliente(cliente, modulos, {
    arquivos: cliente.arquivos.length,
  });

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      modulos={modulos}
      titulo={cliente.nome}
      chamada={`${cliente.processos.length} processo(s) · ${cliente.arquivos.length} documento(s) · ${cliente._count.cobrancas} cobranca(s)`}
    >
      <Link href="/clientes" className="text-sm text-slate-500">
        ← todos os clientes
      </Link>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="cartao">
          <h2 className="font-semibold">Cadastro</h2>
          <p className="mt-1 text-sm text-slate-600">
            So o nome e obrigatorio. Documento de identificacao hoje e o CPF; RG
            nao e exigido em lugar nenhum do sistema.
          </p>
          <div className="mt-4">
            <FichaDoCliente
              id={cliente.id}
              campos={[
                {
                  nome: "nome",
                  rotulo: "Nome / razao social",
                  valor: cliente.nome,
                  obrigatorio: true,
                },
                {
                  nome: "documento",
                  rotulo: "CPF / CNPJ",
                  valor: cliente.documento ?? "",
                  ajuda: "Conferido pelo digito verificador ao salvar a ficha.",
                },
                {
                  nome: "telefone",
                  rotulo: "Telefone",
                  valor: cliente.telefone ?? "",
                },
                {
                  nome: "email",
                  rotulo: "E-mail",
                  valor: cliente.email ?? "",
                  tipo: "email",
                },
              ]}
            />
          </div>
        </section>

        <aside className="grid gap-6">
          <section className="cartao">
            <h2 className="font-semibold">Pendencias do cadastro</h2>
            {pendencias.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">
                Cadastro completo para o que este escritorio usa.
              </p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {pendencias.map((p) => (
                  <li
                    key={p.tipo}
                    className={`rounded-[var(--raio)] border-l-4 px-3 py-2 text-sm ${COR[p.gravidade]}`}
                  >
                    {p.texto}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {cliente.processos.length > 0 ? (
            <section className="cartao">
              <h2 className="font-semibold">Processos</h2>
              <ul className="mt-3 grid gap-2 text-sm">
                {cliente.processos.map((p) => (
                  <li key={p.id} className="text-slate-700">
                    {formatarNumeroProcesso(p.numero)}
                    <span className="block text-xs text-slate-500">
                      {[p.tribunal, p.vara, p.situacao].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>

      <section className="cartao mt-6">
        <h2 className="font-semibold">Documentos deste cliente</h2>
        {cliente.arquivos.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            Nenhum documento anexado. Para anexar, use a aba Arquivos e escolha
            este cliente no vinculo.
          </p>
        ) : (
          <ul className="lista mt-3">
            {cliente.arquivos.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2"
              >
                <span>
                  {/*
                    O download sai sempre como anexo, com nosniff: um .html ou
                    .svg aberto no nosso dominio rodaria script com a sessao do
                    escritorio.
                  */}
                  <a
                    href={`/api/arquivos/${a.id}`}
                    className="font-medium text-[color:var(--marca-primaria)] hover:underline"
                  >
                    {a.nome}
                  </a>
                  <span className="block text-xs text-slate-500">
                    {a.descricao ? `${a.descricao} · ` : ""}
                    {tamanhoLegivel(a.tamanhoBytes)} ·{" "}
                    {dataBR.format(a.criadoEm)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Estrutura>
  );
}
