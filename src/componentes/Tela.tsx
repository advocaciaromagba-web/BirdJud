import Image from "next/image";

/**
 * Uma captura do sistema, dentro de uma moldura de navegador.
 *
 * A moldura existe para o visitante entender em dois segundos que aquilo e
 * uma tela do produto, e nao um desenho bonito feito para o anuncio. As
 * imagens sao capturas de verdade, tiradas por `npm run vitrine:telas`.
 */
export function Tela({
  arquivo,
  alt,
  endereco,
  prioridade = false,
}: {
  arquivo: string;
  alt: string;
  endereco: string;
  prioridade?: boolean;
}) {
  return (
    <figure className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="ml-2 truncate rounded bg-white px-2 py-0.5 text-[11px] text-slate-500">
          {endereco}
        </span>
      </div>
      <Image
        src={`/vitrine/${arquivo}.jpg`}
        alt={alt}
        width={1700}
        height={1125}
        priority={prioridade}
        sizes="(max-width: 1024px) 100vw, 640px"
        className="h-auto w-full"
      />
    </figure>
  );
}
