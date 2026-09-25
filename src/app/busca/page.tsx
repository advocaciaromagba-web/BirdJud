import Link from "next/link";
import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { buscar, MINIMO_DE_LETRAS, termoUtil, type Achado } from "@/lib/busca";
import {
  formatarNumeroProcesso,
  normalizarNumeroProcesso,
} from "@/lib/leitura-publicacao";
import { Estrutura } from "@/componentes/Estrutura";

const ROTULO: Record<Achado["tipo"], string> = {
  CLIENTE: "Cliente",
  PROCESSO: "Processo",
  PUBLICACAO: "Publicacao",
  ARQUIVO: "Arquivo",
};

export default async function PaginaBusca({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const contexto = await contextoDaPagina();
  const termo = (await searchParams).q ?? "";

  const [modulos, achados] = await Promise.all([
    modulosAtivos(contexto.escritorioId),
    termoUtil(termo)
      ? buscar(contexto.escritorioId, termo)
      : Promise.resolve([]),
  ]);

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      modulos={modulos}
      titulo="Busca"
    >
      <p className="mt-1 text-sm text-neutral-500">
        {termoUtil(termo)
          ? `${achados.length} resultado(s) para "${termo}"`
          : `Digite ao menos ${MINIMO_DE_LETRAS} letras. Numero de processo pode vir com ou sem mascara.`}
      </p>

      {termoUtil(termo) && achados.length === 0 ? (
        <p className="mt-6 text-neutral-600">
          Nada encontrado. A busca cobre nome e documento de cliente, numero de
          processo, texto de publicacao e nome de arquivo.
        </p>
      ) : null}

      <ul className="mt-6 divide-y divide-neutral-200">
        {achados.map((achado) => (
          <li key={`${achado.tipo}-${achado.id}`} className="py-3">
            <Link href={achado.destino} className="block hover:text-marca">
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600">
                {ROTULO[achado.tipo]}
              </span>
              <span className="ml-2 font-semibold">
                {achado.tipo === "PROCESSO" || achado.tipo === "PUBLICACAO"
                  ? formatarNumeroProcesso(
                      normalizarNumeroProcesso(achado.titulo) ?? achado.titulo,
                    )
                  : achado.titulo}
              </span>
              {achado.detalhe ? (
                <span className="mt-1 block text-sm text-neutral-600">
                  {achado.detalhe}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </Estrutura>
  );
}
