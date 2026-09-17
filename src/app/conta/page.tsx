import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { Navegacao } from "@/componentes/Navegacao";
import { PainelConta } from "@/componentes/PainelConta";

export default async function PaginaConta() {
  const contexto = await contextoDaPagina();

  const usuario = await comEscritorio(contexto.escritorioId, (db) =>
    db.usuario.findFirst({
      where: { id: contexto.usuarioId },
      select: { nome: true, email: true, papel: true, doisFatores: true },
    })
  );

  return (
    <>
      <Navegacao nomeEscritorio={contexto.marca.nome} papel={contexto.papel} />
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-bold">Minha conta</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {usuario?.nome} · {usuario?.email} · {usuario?.papel}
        </p>
        {/* O segredo do 2FA nunca vai para a tela; so se ele esta ligado. */}
        <PainelConta doisFatoresAtivo={Boolean(usuario?.doisFatores)} />
      </main>
    </>
  );
}
