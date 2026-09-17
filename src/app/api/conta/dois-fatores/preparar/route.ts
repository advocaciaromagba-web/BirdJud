import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { exigirSessao } from "@/lib/sessao";
import { comEscritorio } from "@/lib/prisma";
import { gerarSegredo, urlDeCadastro } from "@/lib/dois-fatores";
import { tratarErro } from "@/lib/respostas";

/**
 * Gera um segredo novo e o devolve junto do QR Code.
 *
 * O segredo so e gravado quando o usuario confirma com um codigo valido
 * (rota /api/conta/dois-fatores). Assim ninguem fica travado com um segundo
 * fator que nao conseguiu cadastrar no aplicativo.
 */
export async function POST() {
  try {
    const { escritorioId, usuarioId, marca } = await exigirSessao();

    const usuario = await comEscritorio(escritorioId, (db) =>
      db.usuario.findFirst({ where: { id: usuarioId } })
    );
    if (!usuario) return NextResponse.json({ erro: "Usuario nao encontrado." }, { status: 404 });

    const segredo = gerarSegredo();
    // O emissor e o escritorio: e o nome que aparece no aplicativo do usuario.
    const uri = urlDeCadastro(marca.nome, usuario.email, segredo);
    const qr = await QRCode.toDataURL(uri);

    return NextResponse.json({ segredo, uri, qr });
  } catch (erro) {
    return tratarErro(erro);
  }
}
