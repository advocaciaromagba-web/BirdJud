// WhatsApp pelo numero do proprio escritorio (Cloud API da Meta).
//
// Nunca um numero unico da plataforma para varios escritorios: a Meta exige
// que a mensagem saia em nome de quem tem relacao com o destinatario, e a nota
// de qualidade do numero seria dividida entre escritorios.
import {
  buscarComLimite,
  descreverFalha,
  mascarar,
  type Conector,
} from "./tipos";

function baseMeta(): string {
  return process.env.META_BASE_URL ?? "https://graph.facebook.com/v21.0";
}

export const conectorWhatsapp: Conector = {
  tipo: "WHATSAPP_META",
  rotulo: "WhatsApp (Cloud API)",
  descricao: "Avisos e lembretes pelo numero do escritorio.",
  modulo: "WHATSAPP",
  campos: [
    {
      nome: "numeroId",
      rotulo: "ID do numero",
      tipo: "text",
      obrigatorio: true,
    },
    {
      nome: "token",
      rotulo: "Token de acesso",
      tipo: "password",
      obrigatorio: true,
    },
  ],
  resumo: (dados) =>
    `Numero ${dados.numeroId ?? "—"} · token ${mascarar(dados.token)}`,

  async testar(dados) {
    try {
      const url = `${baseMeta()}/${encodeURIComponent(dados.numeroId)}?fields=verified_name,quality_rating`;
      const resposta = await buscarComLimite(url, {
        headers: { Authorization: `Bearer ${dados.token}` },
      });

      const corpo = (await resposta.json().catch(() => ({}))) as {
        verified_name?: string;
        quality_rating?: string;
        error?: { message?: string };
      };

      if (!resposta.ok) {
        return {
          ok: false,
          detalhe: corpo.error?.message ?? `Meta respondeu ${resposta.status}.`,
        };
      }

      const qualidade = corpo.quality_rating
        ? ` · qualidade ${corpo.quality_rating}`
        : "";
      return {
        ok: true,
        detalhe: `${corpo.verified_name ?? "Numero conectado"}${qualidade}.`,
      };
    } catch (erro) {
      return { ok: false, detalhe: descreverFalha(erro) };
    }
  },
};
