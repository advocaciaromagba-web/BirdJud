import Link from "next/link";
import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { dataBR } from "@/lib/datas";
import { modulosAtivos, ModuloNaoContratado } from "@/lib/modulos";
import { certificadoGuardado, pendenciasDoEmissor } from "@/lib/nfse";
import { Estrutura } from "@/componentes/Estrutura";
import { PainelNotas, type NotaNaTela } from "@/componentes/PainelNotas";
import { ConfigFiscal, type FiscalNaTela } from "@/componentes/ConfigFiscal";
import { fiscalParaTela } from "@/lib/nfse/cadastro";


export default async function PaginaNotas({
  searchParams,
}: {
  searchParams: Promise<{ clienteId?: string; valor?: string; descricao?: string; cobrancaId?: string }>;
}) {
  let contexto;
  try {
    contexto = await contextoDaPagina("NFSE", "NOTAS");
  } catch (erro) {
    if (erro instanceof ModuloNaoContratado) {
      return (
        <main className="mx-auto max-w-2xl p-10">
          <h1 className="text-2xl font-bold">Modulo nao contratado</h1>
          <p className="mt-3 text-slate-600">O modulo de notas fiscais nao faz parte do plano deste escritorio.</p>
        </main>
      );
    }
    throw erro;
  }
  const pedido = await searchParams;

  const [modulos, dados, cert] = await Promise.all([
    modulosAtivos(contexto.escritorioId),
    comEscritorio(contexto.escritorioId, async (db) => ({
      notas: await db.notaFiscal.findMany({ orderBy: { criadoEm: "desc" }, take: 200 }),
      clientes: await db.cliente.findMany({
        orderBy: { nome: "asc" },
        select: { id: true, nome: true, documento: true },
        take: 2000,
      }),
      fiscal: await db.fiscal.findFirst(),
    })),
    certificadoGuardado(contexto.escritorioId),
  ]);

  const pendencias = pendenciasDoEmissor(dados.fiscal, cert);
  // Quem assina: o titular do certificado; sem titular gravado, um admin.
  const souTitular = cert ? (cert.titularId ? cert.titularId === contexto.usuarioId : contexto.papel === "ADMIN") : false;
  const titularNome = cert?.titularNome ?? (cert ? "um administrador" : null);

  const notas: NotaNaTela[] = dados.notas.map((n) => ({
    id: n.id,
    // Status de antes deste fluxo: RECUSADA e INDETERMINADA.
    status: n.status === "RECUSADA" ? "REJEITADA" : n.status === "INDETERMINADA" ? "PROCESSANDO" : n.status,
    ambiente: n.ambiente,
    numeroDps: n.numero,
    numeroNfse: n.numeroNaPrefeitura,
    dataCompetencia: dataBR.format(n.dataCompetencia ?? n.criadoEm),
    criadaEm: dataBR.format(n.criadoEm),
    valorCentavos: n.valorCentavos,
    descricao: n.descricao,
    tomadorNome: n.tomadorNome || "—",
    erros:
      Array.isArray(n.erros) && n.erros.length > 0
        ? (n.erros as { codigo: string; descricao: string }[])
        : n.erro
          ? [{ codigo: "", descricao: n.erro }]
          : [],
    motivoCancelamento: n.motivoCancelamento,
    vaiAoCliente: n.envioCliente.length > 0,
    temXml: Boolean(n.xmlRetorno),
  }));

  const f = dados.fiscal;
  const fiscal: FiscalNaTela | null = f ? fiscalParaTela(f) : null;

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      nomeUsuario={contexto.nomeUsuario}
      acesso={contexto.acesso}
      modulos={modulos}
      titulo="Notas fiscais"
      chamada="NFS-e pelo Sistema Nacional. A equipe prepara; o titular do certificado assina e emite."
    >
      <section className="cartao mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold">{f?.razaoSocial ?? "Escritorio emissor"}</p>
            <p className="text-xs text-slate-500">
              {cert
                ? `Certificado: ${cert.titular ?? "cadastrado"}${cert.validoAte ? `, valido ate ${dataBR.format(new Date(cert.validoAte))}` : ""} · assina: ${titularNome}`
                : "Sem certificado e-CNPJ"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {f ? (
              <span
                className={`rounded px-2 py-0.5 text-xs font-semibold ${f.ambiente === "PRODUCAO" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}
              >
                {f.ambiente === "PRODUCAO" ? "Producao" : "Testes"}
              </span>
            ) : null}
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold ${pendencias.length === 0 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}
            >
              {pendencias.length === 0 ? "Pronto para emitir" : "Configuracao pendente"}
            </span>
          </div>
        </div>
        {pendencias.length > 0 ? (
          <ul className="mt-2 list-disc pl-5 text-sm text-amber-900">
            {pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
        {contexto.papel === "ADMIN" ? (
          <p className="mt-2 text-sm text-slate-600">
            O certificado e-CNPJ e enviado em{" "}
            <Link href="/administracao" className="text-marca underline">
              Configuracoes
            </Link>
            . Quem envia vira o titular: so essa pessoa assina as notas, digitando a senha a cada assinatura (ela nao
            fica guardada).
          </p>
        ) : null}
        {contexto.papel === "ADMIN" ? <ConfigFiscal fiscal={fiscal} temIA /> : null}
      </section>

      <PainelNotas
        notas={notas}
        clientes={dados.clientes.map((c) => ({ id: c.id, nome: c.nome, documento: c.documento }))}
        pronto={pendencias.length === 0}
        producao={f?.ambiente === "PRODUCAO"}
        souTitular={souTitular}
        titularNome={titularNome}
        descricaoPadrao={f?.descricaoPadrao ?? ""}
        inicial={{
          clienteId: pedido.clienteId ?? "",
          valor: pedido.valor ?? "",
          descricao: pedido.descricao ?? "",
          cobrancaId: pedido.cobrancaId ?? "",
        }}
      />
    </Estrutura>
  );
}
