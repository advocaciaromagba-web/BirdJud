import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { Estrutura } from "@/componentes/Estrutura";
import { PainelConta } from "@/componentes/PainelConta";

export default async function PaginaConta() {
  const contexto = await contextoDaPagina();

  const modulos = await modulosAtivos(contexto.escritorioId);
  const usuario = await comEscritorio(contexto.escritorioId, (db) =>
    db.usuario.findFirst({
      where: { id: contexto.usuarioId },
      select: {
        nome: true,
        email: true,
        papel: true,
        doisFatores: true,
        recebeResumo: true,
        recebeLembretes: true,
        recebeWhatsapp: true,
        telefone: true,
      },
    }),
  );

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      modulos={modulos}
      titulo="Minha conta"
    >
      <p className="mt-1 text-sm text-neutral-500">
        {usuario?.nome} · {usuario?.email} · {usuario?.papel}
      </p>
      {/* O segredo do 2FA nunca vai para a tela; so se ele esta ligado. */}
      <PainelConta
        doisFatoresAtivo={Boolean(usuario?.doisFatores)}
        recebeResumo={usuario?.recebeResumo ?? true}
        recebeLembretes={usuario?.recebeLembretes ?? true}
        recebeWhatsapp={usuario?.recebeWhatsapp ?? false}
        telefone={usuario?.telefone ?? ""}
        temModuloEmail={modulos.includes("EMAIL")}
        temModuloWhatsapp={modulos.includes("WHATSAPP")}
      />
    </Estrutura>
  );
}
