import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirAdmin, recusarSuporte } from "@/lib/sessao";
import { contaComoAdvogado, editarPessoa, EdicaoRecusada } from "@/lib/equipe";
import { monitorarOabDoAdvogado } from "@/lib/implantacao";
import { PAPEIS } from "@/lib/papeis";
import { FaixaEsgotada } from "@/lib/faixas";
import { ehDuplicado, tratarErro } from "@/lib/respostas";

const edicao = z.object({
  nome: z.string().min(2).max(120).optional(),
  email: z.string().email().optional(),
  papel: z.enum(PAPEIS).optional(),
  oab: z.string().max(20).nullable().optional(),
  telefone: z.string().max(40).nullable().optional(),
  ativo: z.boolean().optional(),
  recebeWhatsapp: z.boolean().optional(),
  recebeResumo: z.boolean().optional(),
  recebeLembretes: z.boolean().optional(),
});

/** Edita uma pessoa da equipe. Regras em equipe.ts (editarPessoa). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const contexto = await exigirAdmin();
    // Trocar o e-mail de alguem e pedir "esqueci a senha" daria ao suporte
    // uma entrada que sobrevive ao fim do acesso.
    recusarSuporte(contexto, "Editar pessoas da equipe");
    const { escritorioId, usuarioId } = contexto;
    const { id } = await params;
    const corpo = edicao.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: corpo.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
    }
    const usuario = await editarPessoa(escritorioId, id, corpo.data, usuarioId);
    if (usuario.oabMudou && contaComoAdvogado(usuario.papel)) await monitorarOabDoAdvogado(escritorioId, corpo.data.oab).catch(() => false);
    return NextResponse.json({ usuario });
  } catch (erro) {
    if (erro instanceof EdicaoRecusada || erro instanceof FaixaEsgotada) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    if (ehDuplicado(erro)) {
      return NextResponse.json({ erro: "Já existe um usuário com este e-mail neste escritório." }, { status: 409 });
    }
    return tratarErro(erro);
  }
}
