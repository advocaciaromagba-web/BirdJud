// Conectores cujo teste automatico ainda nao existe.
//
// Estao aqui para a tela dizer a verdade: o escritorio consegue guardar a
// credencial, mas o sistema ainda nao confere sozinho se ela funciona. E
// melhor do que um botao de testar que sempre diz "ok".
import { mascarar, type Conector } from "./tipos";

/** AASP: o clipping nao publica uma API de verificacao aberta. */
export const conectorAasp: Conector = {
  tipo: "AASP",
  rotulo: "AASP (publicacoes)",
  descricao: "Clipping da AASP com a assinatura do proprio escritorio.",
  modulo: "PUBLICACOES_AASP",
  campos: [
    { nome: "usuario", rotulo: "Usuario AASP", tipo: "text", obrigatorio: true },
    { nome: "chave", rotulo: "Chave de acesso", tipo: "password", obrigatorio: true },
  ],
  resumo: (dados) => `${dados.usuario ?? "—"} · chave ${mascarar(dados.chave)}`,
  async testar() {
    return {
      ok: false,
      detalhe:
        "Guardado, mas ainda sem verificacao automatica: falta confirmar com a AASP o uso da API por software de terceiros.",
    };
  },
};

/**
 * OneDrive e Google Drive dependem de OAuth: o escritorio autoriza pelo
 * navegador e a plataforma guarda o token de renovacao. Sem o aplicativo
 * registrado em cada provedor, um formulario de credencial aqui seria
 * teatro — a conexao nem chegaria a existir.
 */
function nuvemPendente(
  tipo: Conector["tipo"],
  rotulo: string,
  provedor: string
): Conector {
  return {
    tipo,
    rotulo,
    descricao: `Pasta do cliente no ${provedor} da conta do escritorio.`,
    modulo: "NUVEM",
    campos: [],
    resumo: () => "Conexao por OAuth, ainda nao disponivel.",
    async testar() {
      return {
        ok: false,
        detalhe: `A conexao com o ${provedor} sera feita por OAuth, com o aplicativo registrado no provedor. Ainda nao disponivel.`,
      };
    },
  };
}

export const conectorMicrosoft = nuvemPendente("MICROSOFT", "OneDrive", "OneDrive");
export const conectorGoogle = nuvemPendente("GOOGLE", "Google Drive", "Google Drive");
