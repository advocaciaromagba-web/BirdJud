import Link from "next/link";
import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { dataHoraBR, horaBR } from "@/lib/datas";
import { escritorioDoEndereco } from "@/lib/sessao";
import { competenciaDe, consumoDoMes } from "@/lib/consumo";
import { montarPainel, pendenciasVisiveis } from "@/lib/painel";
import { formatarNumeroProcesso } from "@/lib/leitura-publicacao";
import { emReais } from "@/lib/dinheiro";
import { DIAS_DE_TESTE } from "@/lib/precos";
import { CapaDaPlataforma } from "@/componentes/CapaDaPlataforma";
import { Estrutura } from "@/componentes/Estrutura";
import { Icone } from "@/componentes/Icone";

function recortar(texto: string, limite = 180): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length <= limite ? limpo : `${limpo.slice(0, limite)}…`;
}

export default async function Painel() {
  const marca = await escritorioDoEndereco();

  // Sem escritorio no endereco, quem chegou veio pela plataforma.
  if (!marca?.id)
    return (
      <CapaDaPlataforma
        dias={DIAS_DE_TESTE}
        contato={process.env.CONTATO_COMERCIAL}
      />
    );

  const contexto = await contextoDaPagina();

  const [painel, consumo, numeros] = await Promise.all([
    montarPainel(contexto.escritorioId),
    consumoDoMes(contexto.escritorioId),
    comEscritorio(contexto.escritorioId, async (db) => ({
      clientes: await db.cliente.count(),
      processos: await db.processo.count({ where: { situacao: "ATIVO" } }),
      compromissos: await db.compromisso.count({
        where: { inicio: { gte: new Date() } },
      }),
    })),
  ]);

  const pendencias = pendenciasVisiveis(painel.pendencias, contexto.papel);
  const nada =
    painel.compromissos.length === 0 &&
    painel.publicacoes.length === 0 &&
    painel.cobrancasVencidas.quantidade === 0 &&
    pendencias.length === 0;

  const indicadores = [
    { rotulo: "Clientes", valor: numeros.clientes, href: "/clientes" },
    {
      rotulo: "Processos ativos",
      valor: numeros.processos,
      href: "/processos",
    },
    { rotulo: "Compromissos", valor: numeros.compromissos, href: "/agenda" },
    {
      rotulo: "Publicacoes nao lidas",
      valor: painel.naoLidas,
      href: "/publicacoes",
    },
  ];

  return (
    <Estrutura
      nomeEscritorio={marca.nome}
      logoUrl={marca.logoUrl}
      papel={contexto.papel}
      modulos={painel.modulos}
      titulo="Hoje"
      chamada="O que pede atencao agora, em uma tela."
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {indicadores.map((indicador) => (
          <Link
            key={indicador.rotulo}
            href={indicador.href}
            className="indicador hover:border-slate-300"
          >
            <p className="indicador-numero">{indicador.valor}</p>
            <p className="indicador-rotulo">{indicador.rotulo}</p>
          </Link>
        ))}
      </div>

      {nada ? (
        <p className="vazio mt-6">
          Nada pedindo atencao agora: sem compromisso nas proximas 48 horas, sem
          publicacao nova e sem cobranca vencida.
        </p>
      ) : null}

      {pendencias.length > 0 ? (
        <section className="mt-8">
          <h2>Precisa de voce</h2>
          <ul className="mt-3 grid gap-2">
            {pendencias.map((pendencia) => (
              <li key={pendencia.tipo}>
                <Link
                  href={pendencia.destino}
                  className="aviso-atencao block hover:brightness-95"
                >
                  {pendencia.texto}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {painel.compromissos.length > 0 ? (
          <section className="cartao">
            <h2>Agenda · proximas 48 horas</h2>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {painel.compromissos.map((compromisso) => (
                <li
                  key={compromisso.id}
                  className="flex flex-wrap items-baseline gap-x-3 py-2.5"
                >
                  <span
                    className={
                      compromisso.hoje ? "etiqueta-marca" : "etiqueta-neutra"
                    }
                  >
                    {compromisso.hoje
                      ? `hoje ${horaBR.format(compromisso.inicio)}`
                      : dataHoraBR.format(compromisso.inicio)}
                  </span>
                  <span className="font-semibold">{compromisso.titulo}</span>
                  <span className="text-slate-500">{compromisso.tipo}</span>
                  {compromisso.local ? (
                    <span className="text-slate-500">
                      · {compromisso.local}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            <Link href="/agenda" className="botao-discreto mt-2">
              Ver a agenda
            </Link>
          </section>
        ) : null}

        {painel.publicacoes.length > 0 ? (
          <section className="cartao">
            <h2>
              Publicacoes nao lidas
              {painel.naoLidas > painel.publicacoes.length
                ? ` (${painel.publicacoes.length} de ${painel.naoLidas})`
                : ""}
            </h2>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {painel.publicacoes.map((publicacao) => (
                <li key={publicacao.id} className="py-2.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    {publicacao.urgente ? (
                      <span className="etiqueta-erro">urgente</span>
                    ) : null}
                    <span className="font-semibold">
                      {publicacao.numeroProcesso
                        ? formatarNumeroProcesso(publicacao.numeroProcesso)
                        : "sem numero de processo"}
                    </span>
                    {publicacao.prazoDias !== null ? (
                      <span className="text-slate-600">
                        prazo indicado: {publicacao.prazoDias} dia(s)
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-slate-600">
                    {recortar(publicacao.texto)}
                  </p>
                </li>
              ))}
            </ul>
            <Link href="/publicacoes" className="botao-discreto mt-2">
              Ler as publicacoes
            </Link>
            <p className="ajuda">
              O prazo indicado e leitura automatica do texto e serve como alerta
              — confira sempre nos autos.
            </p>
          </section>
        ) : null}
      </div>

      {painel.cobrancasVencidas.quantidade > 0 ? (
        <section className="mt-6">
          <Link
            href="/cobrancas"
            className="aviso-erro flex items-center gap-3 hover:brightness-95"
          >
            <Icone nome="cobrancas" />
            <span>
              {painel.cobrancasVencidas.quantidade} cobranca(s) ·{" "}
              {emReais(painel.cobrancasVencidas.totalCentavos)} em aberto depois
              do vencimento
            </span>
          </Link>
        </section>
      ) : null}

      {consumo.length > 0 ? (
        <section className="mt-8">
          <h2>Consumo de {competenciaDe()}</h2>
          <div className="cartao mt-3 p-0">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Metrica</th>
                  <th className="text-right">No mes</th>
                </tr>
              </thead>
              <tbody>
                {consumo.map((linha) => (
                  <tr key={linha.metrica}>
                    <td className="text-slate-600">{linha.metrica}</td>
                    <td className="text-right tabular-nums">
                      {linha.quantidade}
                      {linha.franquia !== null ? ` de ${linha.franquia}` : ""}
                      {linha.excedente > 0 ? (
                        <span className="ml-2 text-amber-700">
                          +{linha.excedente} excedente
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </Estrutura>
  );
}
