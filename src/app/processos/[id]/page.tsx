import Link from "next/link";
import { notFound } from "next/navigation";
import { contextoDaPagina } from "@/lib/pagina";
import { dataBR, dataHoraBR } from "@/lib/datas";
import { fichaDoProcesso } from "@/lib/processo";
import { formatarNumeroProcesso } from "@/lib/leitura-publicacao";
import { emReais } from "@/lib/dinheiro";
import { Estrutura } from "@/componentes/Estrutura";

function recortar(texto: string, limite = 240): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length <= limite ? limpo : `${limpo.slice(0, limite)}…`;
}

function tamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function PaginaDoProcesso({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const contexto = await contextoDaPagina();
  const ficha = await fichaDoProcesso(contexto.escritorioId, (await params).id);
  if (!ficha) notFound();

  const { processo } = ficha;
  const naoLidas = ficha.publicacoes.filter((p) => !p.lida).length;
  const aReceber = ficha.cobrancas
    .filter((c) => c.status === "ABERTA" || c.status === "VENCIDA")
    .reduce((total, c) => total + c.valorCentavos, 0);

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      modulos={ficha.modulos}
      titulo={formatarNumeroProcesso(processo.numero)}
      chamada={
        [
          processo.cliente?.nome,
          processo.tribunal,
          processo.vara,
          processo.area,
          processo.situacao,
        ]
          .filter(Boolean)
          .join(" · ") +
        (processo.distribuicao
          ? ` · distribuido em ${dataBR.format(processo.distribuicao)}`
          : "")
      }
      acao={
        <Link href="/processos" className="botao-secundario">
          ← todos os processos
        </Link>
      }
    >
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        {naoLidas > 0 ? (
          <span className="rounded bg-amber-100 px-2 py-1 text-amber-900">
            {naoLidas} publicacao(oes) nao lida(s)
          </span>
        ) : null}
        {aReceber > 0 ? (
          <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">
            {emReais(aReceber)} a receber
          </span>
        ) : null}
      </div>

      {ficha.publicacoes.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-semibold">
            Publicacoes ({ficha.publicacoes.length})
          </h2>
          <ul className="mt-2 divide-y divide-slate-200 text-sm">
            {ficha.publicacoes.map((publicacao) => (
              <li key={publicacao.id} className="py-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  {publicacao.urgente ? (
                    <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
                      urgente
                    </span>
                  ) : null}
                  {!publicacao.lida ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                      nao lida
                    </span>
                  ) : null}
                  <span className="text-slate-500">
                    {dataBR.format(publicacao.dataDisponibilizacao)}
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
          <Link
            href="/publicacoes"
            className="mt-2 inline-block text-sm text-marca hover:underline"
          >
            Abrir as publicacoes
          </Link>
        </section>
      ) : null}

      {ficha.compromissos.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-semibold">
            Agenda ({ficha.compromissos.length})
          </h2>
          <ul className="mt-2 divide-y divide-slate-200 text-sm">
            {ficha.compromissos.map((compromisso) => (
              <li
                key={compromisso.id}
                className="flex flex-wrap items-baseline gap-x-3 py-2"
              >
                <span className="text-slate-500">
                  {dataHoraBR.format(compromisso.inicio)}
                </span>
                <span
                  className={
                    compromisso.concluido
                      ? "text-slate-400 line-through"
                      : "font-semibold"
                  }
                >
                  {compromisso.titulo}
                </span>
                <span className="text-slate-500">{compromisso.tipo}</span>
                {compromisso.local ? (
                  <span className="text-slate-500">· {compromisso.local}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {ficha.arquivos.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-semibold">
            Documentos ({ficha.arquivos.length})
          </h2>
          <ul className="mt-2 divide-y divide-slate-200 text-sm">
            {ficha.arquivos.map((arquivo) => (
              <li
                key={arquivo.id}
                className="flex flex-wrap items-baseline gap-x-3 py-2"
              >
                <a
                  href={`/api/arquivos/${arquivo.id}`}
                  className="font-semibold text-marca hover:underline"
                >
                  {arquivo.nome}
                </a>
                <span className="text-slate-500">
                  {tamanho(arquivo.tamanhoBytes)}
                </span>
                <span className="ml-auto text-slate-500">
                  {dataBR.format(arquivo.criadoEm)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {ficha.cobrancas.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-semibold">
            Cobrancas ({ficha.cobrancas.length})
          </h2>
          <ul className="mt-2 divide-y divide-slate-200 text-sm">
            {ficha.cobrancas.map((cobranca) => (
              <li
                key={cobranca.id}
                className="flex flex-wrap items-baseline gap-x-3 py-2"
              >
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {cobranca.status}
                </span>
                <span className="font-semibold">
                  {emReais(cobranca.valorCentavos)}
                </span>
                <span className="text-slate-600">{cobranca.descricao}</span>
                <span className="ml-auto text-slate-500">
                  vence em {dataBR.format(cobranca.vencimento)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {ficha.publicacoes.length === 0 &&
      ficha.compromissos.length === 0 &&
      ficha.arquivos.length === 0 &&
      ficha.cobrancas.length === 0 ? (
        <p className="mt-8 text-slate-600">
          Nada ligado a este processo ainda. Publicacao capturada com este
          numero, documento enviado, compromisso marcado ou cobranca emitida
          aparecem aqui.
        </p>
      ) : null}
    </Estrutura>
  );
}
