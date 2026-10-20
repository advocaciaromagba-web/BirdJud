import Link from "next/link";
import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { Estrutura } from "@/componentes/Estrutura";

export const dynamic = "force-dynamic";

/**
 * Area fechada para esta pessoa.
 *
 * Diz QUAL area e QUEM resolve. "Voce nao tem acesso", sem mais nada, faz a
 * pessoa procurar no lugar errado e o administrador do escritorio perguntar de
 * volta o que ja daria para responder.
 */
export default async function PaginaSemAcesso({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const contexto = await contextoDaPagina();
  const modulos = await modulosAtivos(contexto.escritorioId);
  const { motivo } = await searchParams;

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      nomeUsuario={contexto.nomeUsuario}
      acesso={contexto.acesso}
      modulos={modulos}
      titulo="Área fechada"
      chamada="Esta parte do sistema não está liberada para você."
    >
      <section className="cartao max-w-xl">
        <p className="text-sm text-slate-700">
          {motivo?.slice(0, 200) ?? "Seu acesso a esta área está fechado neste escritório."}
        </p>
        <p className="mt-3 text-sm text-slate-600">
          Quem libera é o administrador do escritório, em Usuários. Não é erro do
          sistema nem falta de contratação: é uma decisão de quem administra a
          banca.
        </p>
        <Link href="/" className="botao-principal mt-4 inline-block">
          Voltar ao painel
        </Link>
      </section>
    </Estrutura>
  );
}
