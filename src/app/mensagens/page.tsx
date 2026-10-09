import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { Estrutura } from "@/componentes/Estrutura";
import { PainelMensagens } from "@/componentes/PainelMensagens";
import { mensagensDoEscritorio } from "@/lib/entrega-do-escritorio";

export const dynamic = "force-dynamic";

/**
 * Mensagens que nao chegaram ao cliente — e o que fazer com cada uma.
 *
 * E aqui que o "enviado" deixa de ser promessa: o que a Meta disse que nao
 * entregou, e o que ficou sem confirmacao, aparece com o motivo e com o
 * botao de reenviar ou de marcar como resolvido.
 */
export default async function PaginaMensagens() {
  const contexto = await contextoDaPagina(undefined, "AGENDA");
  const [modulos, mensagens] = await Promise.all([
    modulosAtivos(contexto.escritorioId),
    mensagensDoEscritorio(contexto.escritorioId),
  ]);

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      nomeUsuario={contexto.nomeUsuario}
      acesso={contexto.acesso}
      modulos={modulos}
      titulo="Mensagens"
      chamada="O que nao chegou ao cliente, e o que fazer com cada uma."
    >
      <PainelMensagens {...mensagens} />
    </Estrutura>
  );
}
