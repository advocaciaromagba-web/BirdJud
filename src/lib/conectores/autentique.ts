// Assinatura eletronica pelo Autentique, com o plano do proprio escritorio.
import {
  buscarComLimite,
  descreverFalha,
  mascarar,
  type Conector,
} from "./tipos";

function baseAutentique(): string {
  return (
    process.env.AUTENTIQUE_BASE_URL ??
    "https://api.autentique.com.br/v2/graphql"
  );
}

export const conectorAutentique: Conector = {
  tipo: "AUTENTIQUE",
  rotulo: "Autentique (assinatura)",
  descricao: "Envio de contratos e procuracoes para assinatura eletronica.",
  modulo: "ASSINATURA",
  campos: [
    {
      nome: "token",
      rotulo: "Token da API",
      tipo: "password",
      obrigatorio: true,
    },
  ],
  resumo: (dados) => `Token ${mascarar(dados.token)}`,

  async testar(dados) {
    try {
      const resposta = await buscarComLimite(baseAutentique(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${dados.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "{ me { id email } }" }),
      });

      if (resposta.status === 401 || resposta.status === 403) {
        return { ok: false, detalhe: "Token recusado pelo Autentique." };
      }
      if (!resposta.ok)
        return {
          ok: false,
          detalhe: `Autentique respondeu ${resposta.status}.`,
        };

      const corpo = (await resposta.json()) as {
        data?: { me?: { email?: string } };
        errors?: { message?: string }[];
      };
      // GraphQL responde 200 mesmo com erro: o corpo e que diz.
      if (corpo.errors?.length) {
        return {
          ok: false,
          detalhe: corpo.errors[0]?.message ?? "Token recusado.",
        };
      }
      if (!corpo.data?.me)
        return { ok: false, detalhe: "Resposta sem conta associada." };

      return {
        ok: true,
        detalhe: `Conta ${corpo.data.me.email ?? "conectada"}.`,
      };
    } catch (erro) {
      return { ok: false, detalhe: descreverFalha(erro) };
    }
  },
};
