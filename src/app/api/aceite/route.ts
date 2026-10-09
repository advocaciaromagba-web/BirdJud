import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirAdmin } from "@/lib/sessao";
import { documentosPendentes, ipDaRequisicao, registrarAceite } from "@/lib/aceite";
import { VERSAO_DOS_DOCUMENTOS } from "@/lib/juridico";
import { tratarErro } from "@/lib/respostas";

export const dynamic = "force-dynamic";

const pedido = z.object({
  aceite: z.literal(true),
  versaoAceita: z.string(),
});

/**
 * Aceite dos documentos pelo administrador do escritorio. E o caminho de quem
 * nao passou pela tela de cadastro: conta implantada pela plataforma, ou
 * documento que mudou de versao.
 */
export async function POST(req: Request) {
  try {
    const { escritorioId, usuarioId } = await exigirAdmin();
    const corpo = pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json({ erro: "E preciso marcar o aceite." }, { status: 400 });
    }
    if (corpo.data.versaoAceita !== VERSAO_DOS_DOCUMENTOS) {
      return NextResponse.json(
        { erro: "Os documentos foram atualizados. Recarregue a pagina e leia a versao nova." },
        { status: 409 },
      );
    }
    const pendentes = await documentosPendentes(escritorioId);
    if (pendentes.length === 0) return NextResponse.json({ ok: true });

    const quem = await comEscritorio(escritorioId, (db) =>
      db.usuario.findFirstOrThrow({ where: { id: usuarioId }, select: { nome: true, email: true } }),
    );
    await registrarAceite(
      escritorioId,
      {
        nome: quem.nome,
        email: quem.email,
        ip: ipDaRequisicao(req),
        navegador: req.headers.get("user-agent"),
      },
      pendentes,
    );
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return tratarErro(erro);
  }
}
