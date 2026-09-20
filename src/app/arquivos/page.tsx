import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { dataBR } from "@/lib/datas";
import { modulosAtivos, ModuloNaoContratado } from "@/lib/modulos";
import { espacoDoEscritorio, TAMANHO_MAXIMO_MB } from "@/lib/arquivos";
import { formatarNumeroProcesso } from "@/lib/leitura-publicacao";
import { Navegacao } from "@/componentes/Navegacao";
import { PainelArquivos, type ArquivoNaTela } from "@/componentes/PainelArquivos";

function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function PaginaArquivos() {
  let contexto;
  try {
    contexto = await contextoDaPagina("NUVEM");
  } catch (erro) {
    if (erro instanceof ModuloNaoContratado) {
      return (
        <main className="mx-auto max-w-2xl p-10">
          <h1 className="text-2xl font-bold">Modulo nao contratado</h1>
          <p className="mt-3 text-neutral-600">
            O modulo Nuvem nao faz parte do plano deste escritorio.
          </p>
        </main>
      );
    }
    throw erro;
  }

  const [modulos, espaco, dados] = await Promise.all([
    modulosAtivos(contexto.escritorioId),
    espacoDoEscritorio(contexto.escritorioId),
    comEscritorio(contexto.escritorioId, async (db) => ({
      arquivos: await db.arquivo.findMany({
        orderBy: { criadoEm: "desc" },
        take: 200,
        include: {
          cliente: { select: { nome: true } },
          processo: { select: { numero: true } },
        },
      }),
      clientes: await db.cliente.findMany({
        orderBy: { nome: "asc" },
        select: { id: true, nome: true },
      }),
      processos: await db.processo.findMany({
        orderBy: { criadoEm: "desc" },
        take: 200,
        select: { id: true, numero: true },
      }),
    })),
  ]);

  const data = dataBR;

  const arquivos: ArquivoNaTela[] = dados.arquivos.map((a) => ({
    id: a.id,
    nome: a.nome,
    descricao: a.descricao,
    tamanho: tamanhoLegivel(a.tamanhoBytes),
    data: data.format(a.criadoEm),
    vinculo: a.processo
      ? `Processo ${formatarNumeroProcesso(a.processo.numero)}`
      : a.cliente
        ? `Cliente ${a.cliente.nome}`
        : null,
  }));

  return (
    <>
      <Navegacao nomeEscritorio={contexto.marca.nome} papel={contexto.papel} modulos={modulos} />
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold">Arquivos</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {espaco.arquivos} arquivo(s) · {espaco.usadoMb} MB usados de {espaco.franquiaMb} MB
          contratados (teto de {espaco.tetoMb} MB)
        </p>

        {espaco.usadoMb > espaco.franquiaMb ? (
          <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm">
            O espaco passou da franquia contratada. O que passa e cobrado como excedente, e o
            envio para no teto de {espaco.tetoMb} MB.
          </div>
        ) : null}

        <PainelArquivos
          arquivos={arquivos}
          clientes={dados.clientes.map((c) => ({ valor: c.id, rotulo: c.nome }))}
          processos={dados.processos.map((p) => ({
            valor: p.id,
            rotulo: formatarNumeroProcesso(p.numero),
          }))}
          tamanhoMaximoMb={TAMANHO_MAXIMO_MB}
        />
      </main>
    </>
  );
}
