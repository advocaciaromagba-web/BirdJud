import { NextResponse } from "next/server";
import { exigirAdministracao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { enviarTeste, lerTeste } from "@/lib/teste-whatsapp";
import { respostaDaCobranca } from "@/lib/respostas-de-cobranca";

export const dynamic = "force-dynamic";

const naTela = (t: Awaited<ReturnType<typeof lerTeste>>) =>
  t ? { ...t, enviadoEm: t.enviadoEm.toISOString(), entregueEm: t.entregueEm?.toISOString() ?? null } : null;

/** Manda o teste ao celular de quem clicou. Configuracoes: admin com a segunda senha. */
export async function POST() {
  try {
    const { escritorioId, usuarioId } = await exigirAdministracao();
    return NextResponse.json({ teste: naTela(await enviarTeste(escritorioId, usuarioId)) });
  } catch (erro) {
    return respostaDaCobranca(erro) ?? tratarErro(erro);
  }
}

/** O ultimo teste e o veredito da Meta, para a tela acompanhar. */
export async function GET() {
  try {
    const { escritorioId, usuarioId } = await exigirAdministracao();
    return NextResponse.json({ teste: naTela(await lerTeste(escritorioId, usuarioId)) });
  } catch (erro) {
    return tratarErro(erro);
  }
}
