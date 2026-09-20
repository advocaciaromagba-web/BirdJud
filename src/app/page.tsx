import Link from "next/link";
import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { dataHoraBR, horaBR } from "@/lib/datas";
import { escritorioDoEndereco } from "@/lib/sessao";
import { competenciaDe, consumoDoMes } from "@/lib/consumo";
import { montarPainel, pendenciasVisiveis } from "@/lib/painel";
import { formatarNumeroProcesso } from "@/lib/leitura-publicacao";
import { emReais } from "@/lib/dinheiro";
import { MARCA_NEUTRA } from "@/lib/escritorio";
import { Navegacao } from "@/componentes/Navegacao";

function recortar(texto: string, limite = 140): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length <= limite ? limpo : `${limpo.slice(0, limite)}…`;
}

export default async function Painel() {
  const marca = await escritorioDoEndereco();

  if (!marca?.id) {
    return (
      <main className="mx-auto max-w-2xl p-10">
        <p className="text-sm uppercase tracking-wide text-marca">{MARCA_NEUTRA.nome}</p>
        <h1 className="mt-2 text-3xl font-bold">Sistema juridico white label</h1>
        <p className="mt-4 text-neutral-600">
          Cada escritorio atende em seu proprio endereco.
        </p>
      </main>
    );
  }

  const contexto = await contextoDaPagina();

  const [painel, consumo, numeros] = await Promise.all([
    montarPainel(contexto.escritorioId),
    consumoDoMes(contexto.escritorioId),
    comEscritorio(contexto.escritorioId, async (db) => ({
      clientes: await db.cliente.count(),
      processos: await db.processo.count(),
    })),
  ]);

  const pendencias = pendenciasVisiveis(painel.pendencias, contexto.papel);
  const nada =
    painel.compromissos.length === 0 &&
    painel.publicacoes.length === 0 &&
    painel.cobrancasVencidas.quantidade === 0 &&
    pendencias.length === 0;

  return (
    <>
      <Navegacao
        nomeEscritorio={marca.nome}
        papel={contexto.papel}
        modulos={painel.modulos}
      />
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold">Hoje</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {numeros.clientes} cliente(s) · {numeros.processos} processo(s)
          {painel.naoLidas > 0 ? ` · ${painel.naoLidas} publicacao(oes) nao lida(s)` : ""}
        </p>

        {nada ? (
          <p className="mt-6 rounded border border-neutral-200 p-4 text-neutral-600">
            Nada pedindo atencao agora: sem compromisso nas proximas 48 horas, sem
            publicacao nova e sem cobranca vencida.
          </p>
        ) : null}

        {pendencias.length > 0 ? (
          <section className="mt-6">
            <h2 className="font-semibold">Precisa de voce</h2>
            <ul className="mt-2 grid gap-2">
              {pendencias.map((pendencia) => (
                <li key={pendencia.tipo}>
                  <Link
                    href={pendencia.destino}
                    className="block rounded border border-amber-300 bg-amber-50 p-3 text-sm hover:border-amber-500"
                  >
                    {pendencia.texto}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {painel.compromissos.length > 0 ? (
          <section className="mt-8">
            <h2 className="font-semibold">Agenda · proximas 48 horas</h2>
            <ul className="mt-2 divide-y divide-neutral-200 text-sm">
              {painel.compromissos.map((compromisso) => (
                <li key={compromisso.id} className="flex flex-wrap items-baseline gap-x-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-semibold ${
                      compromisso.hoje
                        ? "bg-marca/10 text-marca"
                        : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {compromisso.hoje ? `hoje ${horaBR.format(compromisso.inicio)}` : dataHoraBR.format(compromisso.inicio)}
                  </span>
                  <span className="font-semibold">{compromisso.titulo}</span>
                  <span className="text-neutral-500">{compromisso.tipo}</span>
                  {compromisso.local ? (
                    <span className="text-neutral-500">· {compromisso.local}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            <Link href="/agenda" className="mt-2 inline-block py-2 text-sm text-marca hover:underline">
              Ver a agenda
            </Link>
          </section>
        ) : null}

        {painel.publicacoes.length > 0 ? (
          <section className="mt-8">
            <h2 className="font-semibold">
              Publicacoes nao lidas
              {painel.naoLidas > painel.publicacoes.length
                ? ` (${painel.publicacoes.length} de ${painel.naoLidas})`
                : ""}
            </h2>
            <ul className="mt-2 divide-y divide-neutral-200 text-sm">
              {painel.publicacoes.map((publicacao) => (
                <li key={publicacao.id} className="py-2">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    {publicacao.urgente ? (
                      <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
                        urgente
                      </span>
                    ) : null}
                    <span className="font-semibold">
                      {publicacao.numeroProcesso
                        ? formatarNumeroProcesso(publicacao.numeroProcesso)
                        : "sem numero de processo"}
                    </span>
                    {publicacao.prazoDias !== null ? (
                      <span className="text-neutral-600">
                        prazo indicado: {publicacao.prazoDias} dia(s)
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-neutral-600">{recortar(publicacao.texto)}</p>
                </li>
              ))}
            </ul>
            <Link
              href="/publicacoes"
              className="mt-2 inline-block py-2 text-sm text-marca hover:underline"
            >
              Ler as publicacoes
            </Link>
            <p className="mt-2 text-xs text-neutral-500">
              O prazo indicado e leitura automatica do texto e serve como alerta — confira
              sempre nos autos.
            </p>
          </section>
        ) : null}

        {painel.cobrancasVencidas.quantidade > 0 ? (
          <section className="mt-8">
            <h2 className="font-semibold">Cobrancas vencidas</h2>
            <Link
              href="/cobrancas"
              className="mt-2 block rounded border border-neutral-200 p-3 text-sm hover:border-marca"
            >
              {painel.cobrancasVencidas.quantidade} cobranca(s) ·{" "}
              {emReais(painel.cobrancasVencidas.totalCentavos)} em aberto depois do
              vencimento
            </Link>
          </section>
        ) : null}

        {consumo.length > 0 ? (
          <section className="mt-8">
            <h2 className="font-semibold">Consumo de {competenciaDe()}</h2>
            <ul className="mt-2 divide-y divide-neutral-200 text-sm">
              {consumo.map((linha) => (
                <li key={linha.metrica} className="flex justify-between gap-4 py-2">
                  <span className="text-neutral-600">{linha.metrica}</span>
                  <span className="tabular-nums">
                    {linha.quantidade}
                    {linha.franquia !== null ? ` de ${linha.franquia}` : ""}
                    {linha.excedente > 0 ? (
                      <span className="ml-2 text-amber-700">
                        +{linha.excedente} excedente
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}
