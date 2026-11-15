import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao, recusarSuporte } from "@/lib/sessao";
import { SemPermissao } from "@/lib/papeis";
import { tratarErro } from "@/lib/respostas";
import { registrarTentativa } from "@/lib/limite";
import {
  CodigoIndisponivel,
  enviarPrimeiroAviso,
  garantirCodigo,
  reenviarPorEmail,
  registrarEntrega,
  trocarCodigo,
} from "@/lib/codigos-do-escritorio";

export const dynamic = "force-dynamic";

// NAO HA CAMPO DE DESTINO, e nao e esquecimento: o codigo so vai para o
// contato que ja esta no cadastro. Pedido com e-mail ou telefone no corpo e
// recusado inteiro (strict), para ninguem achar que foi atendido.
const pedido = z
  .object({ acao: z.enum(["gerar", "pessoalmente", "email", "trocar", "primeiro-aviso"]) })
  .strict();

export async function POST(req: Request, { params }: { params: Promise<{ clienteId: string }> }) {
  try {
    const contexto = await exigirSessao(undefined, "CODIGOS");
    recusarSuporte(contexto, "O código de atendimento dos clientes");
    const { escritorioId, nomeUsuario, usuarioId } = contexto;
    const { clienteId } = await params;
    const corpo = pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json(
        { erro: "Pedido inválido. O código só vai para o contato que já está no cadastro do cliente: não se informa destino." },
        { status: 400 },
      );
    }
    const limite = await registrarTentativa(`codigos:${usuarioId}`, 120, 60 * 60);
    if (!limite.permitido) return NextResponse.json({ erro: "Muitas ações em pouco tempo. Tente de novo mais tarde." }, { status: 429 });

    const { acao } = corpo.data;
    if (acao === "gerar") {
      const codigo = await garantirCodigo(escritorioId, clienteId);
      if (!codigo) throw new CodigoIndisponivel("Não consegui gerar o código deste cliente.");
      return NextResponse.json({ ok: true, texto: "Código criado." });
    }
    if (acao === "pessoalmente") {
      const codigo = await garantirCodigo(escritorioId, clienteId);
      if (!codigo) throw new CodigoIndisponivel("Cliente não encontrado.", 404);
      await registrarEntrega(escritorioId, { clienteId, canal: "PESSOALMENTE", entreguePor: nomeUsuario });
      return NextResponse.json({ ok: true, texto: "Entrega pessoal registrada." });
    }
    if (acao === "email") {
      const destino = await reenviarPorEmail(escritorioId, clienteId, nomeUsuario);
      return NextResponse.json({ ok: true, texto: `Código enviado para ${destino}, o e-mail do cadastro.` });
    }
    // Trocar e mandar o primeiro aviso: so o administrador.
    if (contexto.papel !== "ADMIN") throw new SemPermissao("Só o administrador troca o código ou dispara o aviso.");
    if (acao === "trocar") {
      await trocarCodigo(escritorioId, clienteId, nomeUsuario);
      return NextResponse.json({
        ok: true,
        texto: "Código trocado: o antigo deixou de valer. Entregue o novo pessoalmente ou pelo e-mail do cadastro.",
      });
    }
    await garantirCodigo(escritorioId, clienteId);
    const r = await enviarPrimeiroAviso(escritorioId, { apenasClienteId: clienteId, quem: nomeUsuario });
    if (!r.avisados) {
      return NextResponse.json({
        ok: false,
        texto: r.falhas[0] ?? "Nada a enviar: este cliente já recebeu o aviso pelos canais que tem, ou não tem contato que sirva.",
      });
    }
    return NextResponse.json({ ok: r.falhas.length === 0, texto: `Aviso enviado: ${r.emails} e-mail, ${r.whatsapps} WhatsApp.${r.falhas.length ? ` ${r.falhas.join("; ")}` : ""}` });
  } catch (erro) {
    if (erro instanceof CodigoIndisponivel) return NextResponse.json({ erro: erro.message }, { status: erro.status });
    return tratarErro(erro);
  }
}
