import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { dataBR } from "@/lib/datas";
import { modulosAtivos, ModuloNaoContratado } from "@/lib/modulos";
import { formatarNumeroProcesso } from "@/lib/leitura-publicacao";
import { Estrutura } from "@/componentes/Estrutura";
import { FormularioCriar } from "@/componentes/FormularioCriar";
import {
  ListaPublicacoes,
  type PublicacaoNaTela,
} from "@/componentes/ListaPublicacoes";

const UFS = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
];

export default async function PaginaPublicacoes() {
  let contexto;
  try {
    contexto = await contextoDaPagina("PUBLICACOES_DJEN", "PUBLICACOES");
  } catch (erro) {
    if (erro instanceof ModuloNaoContratado) {
      return (
        <main className="mx-auto max-w-2xl p-10">
          <h1 className="text-2xl font-bold">Módulo não contratado</h1>
          <p className="mt-3 text-slate-600">
            O módulo Publicações não faz parte do plano deste escritório.
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
        include: { triagem: true },
      }),
      oabs: await db.oabMonitorada.findMany({ orderBy: { criadoEm: "asc" } }),
      equipe: await db.usuario.findMany({
        where: { ativo: true },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true, papel: true },
        take: 200,
      }),
      clientes: await db.cliente.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true }, take: 3000 }),
      naoLidas: await db.publicacao.count({
        where: { arquivada: false, lida: false },
      }),
    })),
  ]);

  // Quem vai aos compromissos ja lancados a partir das publicacoes: a lista
  // se edita aqui mesmo, com o mesmo seletor da Agenda.
  const idsDeCompromisso = dados.publicacoes
    .map((p) => p.triagem?.compromissoId)
    .filter((id): id is string => Boolean(id));
  const participantes = idsDeCompromisso.length
    ? await comEscritorio(contexto.escritorioId, (db) =>
        db.participanteDeCompromisso.findMany({
          where: { compromissoId: { in: idsDeCompromisso } },
          orderBy: { criadoEm: "asc" },
          include: { cliente: { select: { nome: true } } },
        }),
      )
    : [];
  const participantesDe = (compromissoId: string | null) =>
    participantes
      .filter((x) => x.compromissoId === compromissoId)
      .map((x) => ({
        clienteId: x.clienteId,
        nome: x.clienteId ? "" : (x.nome ?? ""),
        telefone: x.telefone ?? "",
        email: x.email ?? "",
        papel: x.papel ?? "",
        avisar: x.avisar,
      }));

  const data = dataBR;

  const publicacoes: PublicacaoNaTela[] = dados.publicacoes.map((p) => ({
    id: p.id,
    numeroProcesso: p.numeroProcesso,
    numeroFormatado: p.numeroProcesso
      ? formatarNumeroProcesso(p.numeroProcesso)
      : null,
    temProcesso: p.processoId !== null,
    segredo: p.segredo,
    partes: (Array.isArray(p.partes) ? (p.partes as { nome: string }[]) : []).map((x) => x.nome).slice(0, 6),
    tribunal: p.tribunal,
    orgao: p.orgao,
    tipoComunicacao: p.tipoComunicacao,
    texto: p.texto,
    link: p.link,
    oab: p.oab,
    data: data.format(p.dataDisponibilizacao),
    urgente: p.urgente,
    repeticao: p.vereditoDeRepeticao,
    prazoDias: p.prazoDias,
    lida: p.lida,
    temIA: modulos.includes("IA"),
    triagem: p.triagem
      ? {
          id: p.triagem.id,
          especie: p.triagem.especie,
          tipo: p.triagem.tipo,
          titulo: p.triagem.titulo,
          resumo: p.triagem.resumo,
          prazoFatal: p.triagem.prazoFatal ? data.format(p.triagem.prazoFatal) : null,
          prazoSugerido: p.triagem.prazoSugerido
            ? p.triagem.prazoSugerido.toISOString()
            : null,
          dataDoAto: p.triagem.dataDoAto ? p.triagem.dataDoAto.toISOString() : null,
          confianca: p.triagem.confianca,
          atencao: p.triagem.atencao,
          explicacao: p.triagem.explicacao,
          aceita: p.triagem.aceitaEm !== null,
          aceitaComoTarefa: p.triagem.tarefaId !== null,
          recusada: p.triagem.recusadaEm !== null,
          compromissoId: p.triagem.compromissoId,
          participantes: participantesDe(p.triagem.compromissoId),
        }
      : null,
  }));

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      nomeUsuario={contexto.nomeUsuario}
      acesso={contexto.acesso}
      modulos={modulos}
      titulo="Publicacoes"
    >
      <p className="mt-1 text-sm text-slate-500">
        {dados.naoLidas} não lida(s) ·{" "}
        {dados.oabs.filter((o) => o.ativo).length} OAB(s) monitorada(s) · fonte:
        DJEN
      </p>

      {dados.oabs.length === 0 ? (
        <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm">
          Nenhuma OAB monitorada ainda. Sem OAB cadastrada, não há o que
          capturar.
        </div>
      ) : null}

      {contexto.papel === "ADMIN" ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-marca">
            OABs monitoradas ({dados.oabs.length})
          </summary>
          <ul className="mt-3 divide-y divide-slate-200 text-sm">
            {dados.oabs.map((oab) => (
              <li key={oab.id} className="flex justify-between gap-3 py-2">
                <span>
                  <span className="font-semibold">
                    {oab.numero}/{oab.uf}
                  </span>
                  {oab.nomeAdvogado ? (
                    <span className="block text-slate-500">
                      {oab.nomeAdvogado}
                    </span>
                  ) : null}
                </span>
                <span className="text-right text-slate-500">
                  {oab.ultimaCaptura
                    ? `capturada em ${data.format(oab.ultimaCaptura)}`
                    : "ainda não capturada"}
                  <span className="block text-xs">
                    {oab.processosImportadosEm
                      ? `processos buscados em ${data.format(oab.processosImportadosEm)}`
                      : "buscando os processos dos últimos 12 meses"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <FormularioCriar
            rota="/api/oabs"
            campos={[
              { nome: "numero", rotulo: "Número da OAB", obrigatorio: true },
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

      <ListaPublicacoes
        publicacoes={publicacoes}
        equipe={dados.equipe.map((p) => ({
          id: p.id,
          nome: `${p.nome} (${p.papel.toLowerCase()})`,
        }))}
        clientes={dados.clientes}
        comWhatsapp={modulos.includes("WHATSAPP")}
      />
    </Estrutura>
  );
}
