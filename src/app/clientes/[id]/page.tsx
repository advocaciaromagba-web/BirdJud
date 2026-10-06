import Link from "next/link";
import { notFound } from "next/navigation";
import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { dataBR } from "@/lib/datas";
import { tamanhoLegivel } from "@/lib/arquivos";
import { formatarNumeroProcesso } from "@/lib/leitura-publicacao";
import { pendenciasDoCliente } from "@/lib/clientes";
import {
  ehPessoaJuridica,
  qualificacao,
  type Endereco,
} from "@/lib/representantes";
import {
  ROTULO_DO_GRUPO,
  emTexto,
  type GrupoDoChecklist,
} from "@/lib/checklist";
import { Estrutura } from "@/componentes/Estrutura";
import { FichaDoCliente } from "@/componentes/FichaDoCliente";
import {
  ChecklistDoCliente,
  type ItemNaTela,
} from "@/componentes/ChecklistDoCliente";
import {
  RepresentantesDoCliente,
  type RepresentanteNaTela,
} from "@/componentes/RepresentantesDoCliente";

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
        itensDeChecklist: {
          orderBy: { ordem: "asc" },
          include: { arquivo: { select: { nome: true } } },
        },
        representantes: { orderBy: { ordem: "asc" } },
      },
    }),
  );
  // Cliente de outro escritorio nao e "proibido", e inexistente: a extensao
  // ja filtrou. Dizer "proibido" contaria que aquele id existe em algum lugar.
  if (!cliente) notFound();

  const pendencias = pendenciasDoCliente(cliente, modulos, {
    arquivos: cliente.arquivos.length,
    essenciaisPendentes: cliente.itensDeChecklist.filter(
      (i) => i.essencial && i.entregueEm === null,
    ).length,
  });

  const enderecoDaEmpresa = (cliente.endereco ?? null) as Endereco | null;
  const representantes: RepresentanteNaTela[] = cliente.representantes.map(
    (r) => ({
      nome: r.nome,
      cpf: r.cpf,
      rg: r.rg ?? "",
      nacionalidade: r.nacionalidade ?? "",
      estadoCivil: r.estadoCivil ?? "",
      profissao: r.profissao ?? "",
      email: r.email ?? "",
      telefone: r.telefone ?? "",
      mesmoEnderecoDaEmpresa: r.mesmoEnderecoDaEmpresa,
      // A qualificacao e montada no servidor, pelo mesmo codigo que a peca vai
      // usar: mostrar na tela um texto diferente do que sai na peca seria pior
      // que nao mostrar nada.
      qualificacao: qualificacao(
        {
          nome: r.nome,
          cpf: r.cpf,
          rg: r.rg,
          nacionalidade: r.nacionalidade,
          estadoCivil: r.estadoCivil,
          profissao: r.profissao,
          endereco: (r.endereco ?? null) as Endereco | null,
          mesmoEnderecoDaEmpresa: r.mesmoEnderecoDaEmpresa,
        },
        enderecoDaEmpresa,
      ),
    }),
  );

  const itensDoChecklist: ItemNaTela[] = cliente.itensDeChecklist.map((i) => ({
    id: i.id,
    grupo: i.grupo,
    rotuloDoGrupo:
      ROTULO_DO_GRUPO[i.grupo as GrupoDoChecklist] ?? i.grupo,
    documento: i.documento,
    paraQue: i.paraQue,
    essencial: i.essencial,
    entregue: i.entregueEm !== null,
    arquivoNome: i.arquivo?.nome ?? null,
  }));

  // O texto sai do MESMO dado que a tela mostra, e nao de uma segunda consulta:
  // mandar ao cliente uma lista diferente da que o escritorio esta vendo seria
  // o pior desfecho possivel aqui.
  const textoParaCliente =
    cliente.itensDeChecklist.length > 0
      ? emTexto(
          {
            tipoAcao: cliente.itensDeChecklist[0]?.tipoAcao ?? "",
            itens: cliente.itensDeChecklist.map((i) => ({
              documento: i.documento,
              paraQue: i.paraQue,
              essencial: i.essencial,
              grupo: i.grupo as GrupoDoChecklist,
            })),
            observacoes: [],
          },
          cliente.nome,
          contexto.marca.nome,
        )
      : null;

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

      {/*
        So para pessoa juridica: pedir representante legal de pessoa fisica e
        pedir que alguem invente um dado.
      */}
      {ehPessoaJuridica(cliente.documento) ? (
        <div className="mt-6">
          <RepresentantesDoCliente
            clienteId={cliente.id}
            iniciais={representantes}
          />
        </div>
      ) : null}

      <div className="mt-6">
        <ChecklistDoCliente
          clienteId={cliente.id}
          tipoAcao={cliente.itensDeChecklist[0]?.tipoAcao ?? null}
          itens={itensDoChecklist}
          temIA={modulos.includes("IA")}
          textoParaCliente={textoParaCliente}
        />
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
