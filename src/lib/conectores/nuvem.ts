// OneDrive e Google Drive na tela de integracoes.
//
// Nao tem campo para preencher: a conexao e pelo botao, que leva a pessoa a
// Microsoft ou ao Google para entrar na conta do escritorio e autorizar. O
// teste usa o token guardado, com o escritorio em maos — por isso recebe o
// contexto, e nao so os dados.
import { type Conector } from "./tipos";
import { NUVENS, type Provedor } from "../nuvem";
import { testarNuvem } from "../nuvem-do-escritorio";

function conectorDaNuvem(provedor: Provedor, descricao: string): Conector {
  const nuvem = NUVENS[provedor];
  return {
    tipo: provedor,
    rotulo: nuvem.rotulo,
    descricao,
    modulo: "NUVEM",
    campos: [],
    oauth: provedor,
    resumo: (dados) => (dados.conta ? `Conta ${dados.conta}` : "Conta conectada"),
    async testar(_dados, contexto) {
      if (!contexto) return { ok: false, detalhe: "Teste sem escritorio." };
      return testarNuvem(contexto.escritorioId);
    },
  };
}

export const conectorMicrosoft = conectorDaNuvem(
  "MICROSOFT",
  "A pasta de cada cliente no OneDrive do escritorio — conta pessoal (Outlook, Hotmail) ou Microsoft 365. O sistema cria as pastas sozinho e copia para la os documentos anexados.",
);

export const conectorGoogle = conectorDaNuvem(
  "GOOGLE",
  "A pasta de cada cliente no Google Drive do escritorio — Gmail ou Google Workspace. O sistema cria as pastas sozinho e copia para la os documentos anexados.",
);
