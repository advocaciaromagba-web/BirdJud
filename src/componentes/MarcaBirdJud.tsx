import Image from "next/image";
import Link from "next/link";

/**
 * A marca da plataforma.
 *
 * So aparece onde a plataforma fala por si: o endereco principal, o cadastro
 * e o painel da plataforma. Dentro do subdominio de um escritorio quem manda
 * e a marca DELE — por isso esta peca nao entra na Estrutura.
 *
 * Duas formas: a completa, com assinatura e chamada, para capa de pagina; e a
 * compacta, simbolo mais nome, para cabecalho — onde a chamada em corpo 8
 * seria so borrao.
 *
 * E duas versoes de cor. A marca e azul profundo com ouro: sobre fundo claro
 * ela se le inteira, sobre a faixa escura o "BIRD" azul sumiria no fundo.
 * Por isso a versao clara, toda em ouro e creme.
 */
export function MarcaBirdJud({
  forma = "compacta",
  fundo = "claro",
  largura,
  comLink = true,
}: {
  forma?: "completa" | "compacta";
  /** A cor do fundo em que a marca vai pousar, nao a cor da marca. */
  fundo?: "claro" | "escuro";
  largura?: number;
  comLink?: boolean;
}) {
  const alt =
    "BirdJud — gestao para escritorios de advocacia com inteligencia artificial";

  if (fundo === "escuro") {
    const peca = (
      <Image
        src="/marca/vertical-claro.png"
        alt={alt}
        width={600}
        height={752}
        priority
        className="h-auto"
        style={{ width: largura ?? 180, maxWidth: "100%" }}
      />
    );
    return comLink ? (
      <Link href="/" className="inline-flex">
        {peca}
      </Link>
    ) : (
      peca
    );
  }

  const peca =
    forma === "completa" ? (
      <Image
        src="/marca/horizontal.png"
        alt={alt}
        width={900}
        height={655}
        priority
        className="h-auto"
        style={{ width: largura ?? 320, maxWidth: "100%" }}
      />
    ) : (
      <span className="flex items-center gap-2.5">
        <Image
          src="/marca/simbolo.png"
          alt=""
          width={512}
          height={522}
          priority
          className="h-9 w-auto"
        />
        <span
          className="text-xl font-bold tracking-tight"
          style={{ fontFamily: "var(--fonte-titulo)" }}
        >
          <span style={{ color: "var(--marca-primaria)" }}>BIRD</span>
          <span style={{ color: "var(--marca-secundaria)" }}>JUD</span>
        </span>
      </span>
    );

  return comLink ? (
    <Link href="/" className="inline-flex">
      {peca}
    </Link>
  ) : (
    peca
  );
}
