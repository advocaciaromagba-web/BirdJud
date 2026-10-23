import { getServerSession } from "next-auth";
import { opcoesAuth } from "@/lib/auth";
import { EncerrarSuporte } from "./EncerrarSuporte";

/**
 * Faixa em toda tela do escritorio enquanto o suporte da plataforma esta
 * dentro: quem olha a tela sabe, sem perguntar, que nao e o administrador.
 */
export async function FaixaDeSuporte() {
  const sessao = await getServerSession(opcoesAuth);
  if (!sessao?.suporte) return null;
  const ate = new Date(sessao.suporte.ate).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  return (
    <div role="status" className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-3 bg-amber-300 px-4 py-2 text-sm font-semibold text-amber-950">
      <span>
        Acesso de suporte da plataforma ({sessao.suporte.operador}), até {ate}. Tudo o que for feito aqui fica no
        registro de acesso.
      </span>
      <EncerrarSuporte />
    </div>
  );
}
