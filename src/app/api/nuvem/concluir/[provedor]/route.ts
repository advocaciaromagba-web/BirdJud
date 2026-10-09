import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/sessao";
import { COOKIE_NONCE, FalhaNaNuvem, NUVENS, lerEstado, nonceConfere } from "@/lib/nuvem";
import {
  baseDoEscritorio,
  baseDaPlataforma,
  enderecoDeRetorno,
  provedorDoCaminho,
} from "@/lib/nuvem/enderecos";
import { conectarNuvem, OutraNuvemConectada } from "@/lib/nuvem-do-escritorio";
import { enfileirar } from "@/lib/fila";

export const dynamic = "force-dynamic";

/**
 * Conclusao, no subdominio do escritorio. Confere tudo antes de trocar o
 * codigo: bilhete assinado e no prazo, mesmo escritorio, mesma pessoa,
 * administrador, e o nonce do cookie igual ao do bilhete.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ provedor: string }> },
) {
  const provedor = provedorDoCaminho((await params).provedor);
  const url = new URL(req.url);
  const estado = lerEstado(url.searchParams.get("state"));

  // Sem bilhete valido nao ha escritorio confiavel para onde voltar.
  if (!provedor || !estado || estado.p !== provedor) {
    return NextResponse.redirect(`${baseDaPlataforma()}/`);
  }
  const base = baseDoEscritorio(estado.s);
  const voltar = (ok: boolean, motivo?: string) => {
    const r = NextResponse.redirect(
      `${base}/integracoes?nuvem=${ok ? "conectada" : "erro"}${motivo ? `&motivo=${encodeURIComponent(motivo.slice(0, 200))}` : ""}`,
    );
    r.cookies.set(COOKIE_NONCE, "", { path: "/api/nuvem", maxAge: 0 });
    return r;
  };

  let contexto;
  try {
    contexto = await exigirAdmin("NUVEM");
  } catch {
    return voltar(false, "Entre no sistema como administrador e conecte de novo.");
  }

  const nonce = (await cookies()).get(COOKIE_NONCE)?.value;
  if (
    contexto.escritorioId !== estado.e ||
    contexto.usuarioId !== estado.u ||
    contexto.marca.slug !== estado.s ||
    !nonceConfere(nonce, estado.n)
  ) {
    return voltar(false, "A conexao foi iniciada em outra sessao. Clique em Conectar de novo.");
  }

  if (url.searchParams.get("error")) {
    return voltar(false, `A autorizacao no ${NUVENS[provedor].rotulo} foi cancelada.`);
  }
  const codigo = url.searchParams.get("code");
  if (!codigo) return voltar(false, "O provedor nao devolveu a autorizacao.");

  try {
    await conectarNuvem(contexto.escritorioId, provedor, codigo, enderecoDeRetorno(provedor));
  } catch (erro) {
    if (erro instanceof OutraNuvemConectada || erro instanceof FalhaNaNuvem) {
      return voltar(false, erro.message);
    }
    console.log(`nuvem ${contexto.escritorioId}: conexao falhou ${(erro as Error).message}`.slice(0, 300));
    return voltar(false, "Nao foi possivel concluir a conexao. Tente de novo em instantes.");
  }

  // As pastas dos clientes que ja existem saem pela fila, em seguida.
  await enfileirar("ORGANIZAR_NUVEM", contexto.escritorioId);
  return voltar(true);
}
