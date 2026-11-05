import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { Estrutura } from "@/componentes/Estrutura";
import { PainelConta } from "@/componentes/PainelConta";
import { AgendaNoNetlead } from "@/componentes/AgendaNoNetlead";

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
        alertaSonoro: true,
        telefone: true,
      },
    }),
  );

  // A chave cifrada nunca sai daqui: so os 4 ultimos caracteres.
  const ligacao = await comEscritorio(contexto.escritorioId, (db) =>
    db.agendaNoNetlead.findFirst({
      where: { usuarioId: contexto.usuarioId },
      select: { chaveFinal: true, ativo: true, pessoa: true, erro: true, enviadoEm: true },
    }),
  );
  const quando = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      nomeUsuario={contexto.nomeUsuario}
      acesso={contexto.acesso}
      modulos={modulos}
      titulo="Minha conta"
    >
      <p className="mt-1 text-sm text-slate-500">
        {usuario?.nome} · {usuario?.email} · {usuario?.papel}
      </p>
      {/* O segredo do 2FA nunca vai para a tela; so se ele esta ligado. */}
      <PainelConta
        doisFatoresAtivo={Boolean(usuario?.doisFatores)}
        recebeResumo={usuario?.recebeResumo ?? true}
        recebeLembretes={usuario?.recebeLembretes ?? true}
        recebeWhatsapp={usuario?.recebeWhatsapp ?? false}
        alertaSonoro={usuario?.alertaSonoro ?? true}
        telefone={usuario?.telefone ?? ""}
        temModuloEmail={modulos.includes("EMAIL")}
        temModuloWhatsapp={modulos.includes("WHATSAPP")}
      />
      <AgendaNoNetlead
        ligacao={
          ligacao
            ? {
                final: ligacao.chaveFinal,
                ativo: ligacao.ativo,
                pessoa: ligacao.pessoa,
                erro: ligacao.erro,
                enviadoEm: ligacao.enviadoEm ? quando.format(ligacao.enviadoEm) : null,
              }
            : null
        }
      />
    </Estrutura>
  );
}
