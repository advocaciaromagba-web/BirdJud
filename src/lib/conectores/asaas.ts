// Cobrancas pelo Asaas, com a conta do proprio escritorio.
import {
  buscarComLimite,
  descreverFalha,
  mascarar,
  type Conector,
} from "./tipos";

/** Producao por padrao; sandbox em desenvolvimento e nos testes. */
function baseAsaas(): string {
  return process.env.ASAAS_BASE_URL ?? "https://api.asaas.com/v3";
}

export const conectorAsaas: Conector = {
  tipo: "ASAAS",
  rotulo: "Asaas (cobrancas)",
  descricao: "Boletos, Pix e cartao na conta Asaas do escritorio.",
  modulo: "COBRANCAS",
  campos: [
    {
      nome: "chave",
      rotulo: "Chave de API",
      tipo: "password",
      obrigatorio: true,
      ajuda: "Asaas > Configuracoes > Integracoes > Chave de API",
    },
  ],
  resumo: (dados) => `Chave ${mascarar(dados.chave)}`,

  async testar(dados) {
    try {
      const resposta = await buscarComLimite(`${baseAsaas()}/myAccount`, {
        headers: { access_token: dados.chave, "User-Agent": "BirdJud" },
      });

      if (resposta.status === 401)
        return { ok: false, detalhe: "Chave recusada pelo Asaas." };
      if (!resposta.ok) {
        return { ok: false, detalhe: `Asaas respondeu ${resposta.status}.` };
      }

      const conta = (await resposta.json()) as {
        name?: string;
        email?: string;
      };
      return {
        ok: true,
        detalhe: `Conta ${conta.name ?? conta.email ?? "conectada"}.`,
      };
    } catch (erro) {
      return { ok: false, detalhe: descreverFalha(erro) };
    }
  },
};
