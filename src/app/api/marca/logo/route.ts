import { NextResponse } from "next/server";
import { escritorioDoEndereco } from "@/lib/sessao";
import * as disco from "@/lib/armazenamento";
import { ID_DO_LOGO } from "@/lib/identidade";

export const dynamic = "force-dynamic";

/**
 * Serve o logotipo do escritorio DESTE endereco.
 *
 * Sem sessao de proposito: o logotipo aparece na tela de login e na de
 * redefinicao de senha, antes de existir sessao. Mas tambem sem parametro de
 * escritorio — quem decide de quem e o logotipo e o subdominio, nao quem
 * chama. Assim nao da para pedir o logotipo de outro escritorio.
 */
export async function GET() {
  const marca = await escritorioDoEndereco();
  if (!marca?.id) {
    return NextResponse.json({ erro: "Endereco sem escritorio." }, { status: 404 });
  }

  let conteudo: Buffer;
  try {
    conteudo = await disco.ler(marca.id, ID_DO_LOGO);
  } catch {
    return NextResponse.json({ erro: "Sem logotipo." }, { status: 404 });
  }

  // O tipo vem do conteudo, nao do que foi declarado no envio: assim nem um
  // arquivo renomeado e servido como outra coisa.
  const tipo = conteudo.subarray(0, 4).toString("hex").toUpperCase();
  const mime = tipo.startsWith("89504E47")
    ? "image/png"
    : tipo.startsWith("FFD8FF")
      ? "image/jpeg"
      : conteudo.subarray(0, 100).toString("utf8").includes("<svg")
        ? "image/svg+xml"
        : conteudo.subarray(8, 12).toString("ascii") === "WEBP"
          ? "image/webp"
          : "application/octet-stream";

  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "content-type": mime,
      // Um ano, porque a URL muda a cada envio (?v=timestamp). Cache curto
      // aqui significaria buscar o mesmo logotipo em toda tela do sistema.
      "cache-control": "public, max-age=31536000, immutable",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
