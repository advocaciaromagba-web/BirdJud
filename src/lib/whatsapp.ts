// WhatsApp pela Cloud API da Meta, com o numero do proprio escritorio.
//
// UM FATO MANDA EM TODO O RESTO: fora da janela de 24 horas aberta por uma
// mensagem do destinatario, a Meta so entrega MODELO APROVADO por ela. Aviso
// nosso e quase sempre proativo — ninguem escreveu para o escritorio pedindo o
// resumo do dia —, entao o envio comum e sempre de modelo. Texto livre
// funcionaria nos testes, em producao entregaria as vezes, e o escritorio
// descobriria o limite no dia do prazo.
//
// A UNICA EXCECAO e `responderTexto`, e ela existe porque a janela esta
// comprovadamente aberta: a pessoa acabou de escrever para nos. E o caso da
// resposta automatica ao lembrete de audiencia (src/lib/resposta-whatsapp.ts).
// Fora desse caminho, nao se chama essa funcao.
//
// O numero e o token sao do escritorio (Integracoes). A plataforma nao tem
// numero proprio para emprestar: a Meta exige que a mensagem saia de quem tem
// relacao com o destinatario, e a nota de qualidade seria dividida entre
// escritorios que nao se conhecem.
import { createHmac, timingSafeEqual } from "node:crypto";
import { obterIntegracao, IntegracaoAusente } from "./integracao";
import { buscarComLimite, descreverFalha } from "./conectores/tipos";

export type CredencialWhatsapp = {
  numeroId: string;
  token: string;
};

export class SemNumeroDeWhatsapp extends Error {
  readonly status = 503;
  constructor() {
    super("O escritorio ainda nao conectou o WhatsApp em Integracoes.");
    this.name = "SemNumeroDeWhatsapp";
  }
}

export class FalhaNoWhatsapp extends Error {
  readonly status: number;
  /** true quando repetir a tentativa nao vai adiantar. */
  readonly definitivo: boolean;
  constructor(motivo: string, definitivo: boolean, status = 502) {
    super(motivo);
    this.name = "FalhaNoWhatsapp";
    this.definitivo = definitivo;
    this.status = status;
  }
}

function baseMeta(): string {
  return process.env.META_BASE_URL ?? "https://graph.facebook.com/v21.0";
}

export async function credencialDoEscritorio(
  escritorioId: string,
): Promise<CredencialWhatsapp> {
  try {
    const dados = await obterIntegracao<CredencialWhatsapp>(
      escritorioId,
      "WHATSAPP_META",
    );
    if (!dados.numeroId || !dados.token) throw new SemNumeroDeWhatsapp();
    return dados;
  } catch (erro) {
    if (erro instanceof IntegracaoAusente) throw new SemNumeroDeWhatsapp();
    throw erro;
  }
}

/**
 * Telefone brasileiro em E.164, que e o formato que a Meta aceita.
 *
 * Aceita o que a equipe realmente digita: "(71) 99999-8888", "71999998888",
 * "+55 71 99999-8888". Devolve null quando nao da para ter certeza — mandar
 * para numero adivinhado e pior que nao mandar.
 */
export function paraE164BR(bruto: string | null | undefined): string | null {
  if (!bruto) return null;
  let digitos = bruto.replace(/\D/g, "");

  // Ja veio com o pais.
  if (
    digitos.startsWith("55") &&
    (digitos.length === 12 || digitos.length === 13)
  ) {
    digitos = digitos.slice(2);
  }
  // DDD + 8 (fixo) ou 9 (celular) digitos.
  if (digitos.length !== 10 && digitos.length !== 11) return null;

  const ddd = Number(digitos.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;

  return `55${digitos}`;
}

export type ParametroDoModelo = string;

export type EnvioDeModelo = {
  para: string;
  modelo: string;
  idioma?: string;
  parametros: ParametroDoModelo[];
};

export type ResultadoDoEnvio = {
  idNaMeta: string;
};

/**
 * Manda um modelo aprovado.
 *
 * Erro da Meta vira erro nosso com um julgamento junto: `definitivo` diz se
 * repetir adianta. Modelo inexistente e numero sem WhatsApp nao melhoram na
 * terceira tentativa; limite de taxa e queda de rede, sim.
 */
export async function enviarModelo(
  escritorioId: string,
  envio: EnvioDeModelo,
): Promise<ResultadoDoEnvio> {
  const credencial = await credencialDoEscritorio(escritorioId);

  const corpo = {
    messaging_product: "whatsapp",
    to: envio.para,
    type: "template",
    template: {
      name: envio.modelo,
      language: { code: envio.idioma ?? "pt_BR" },
      components: [
        {
          type: "body",
          parameters: envio.parametros.map((texto) => ({
            type: "text",
            text: texto,
          })),
        },
      ],
    },
  };

  let resposta: Response;
  try {
    resposta = await buscarComLimite(
      `${baseMeta()}/${encodeURIComponent(credencial.numeroId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credencial.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(corpo),
      },
    );
  } catch (erro) {
    throw new FalhaNoWhatsapp(descreverFalha(erro), false);
  }

  const json = (await resposta.json().catch(() => null)) as {
    messages?: { id?: string }[];
    error?: { message?: string; code?: number };
  } | null;

  if (!resposta.ok) {
    const codigo = json?.error?.code ?? 0;
    const mensagem =
      json?.error?.message ?? `A Meta respondeu ${resposta.status}.`;
    throw new FalhaNoWhatsapp(
      explicar(codigo, mensagem),
      ehDefinitivo(codigo, resposta.status),
    );
  }

  const id = json?.messages?.[0]?.id;
  if (!id)
    throw new FalhaNoWhatsapp(
      "A Meta aceitou sem devolver o id da mensagem.",
      false,
    );
  return { idNaMeta: id };
}

/**
 * Traduz o codigo da Meta para algo que o escritorio resolva sozinho.
 *
 * Sao os quatro que realmente aparecem. Codigo fora da lista passa com a
 * mensagem original: inventar explicacao para erro que nao se conhece e pior
 * que repetir o que a Meta disse.
 */
export function explicar(codigo: number, mensagem: string): string {
  if (codigo === 132001) {
    return "Modelo nao encontrado na conta da Meta: confira se ele foi criado e aprovado, com este nome e neste idioma.";
  }
  if (codigo === 131047) {
    return "A janela de 24 horas com este numero esta fechada — so modelo aprovado entra, e este nao passou.";
  }
  if (codigo === 131026) {
    return "Este numero nao recebe no WhatsApp.";
  }
  if (codigo === 190) {
    return "Token do WhatsApp expirado ou revogado: reconecte em Integracoes.";
  }
  return mensagem;
}

function ehDefinitivo(codigo: number, status: number): boolean {
  // Limite de taxa e erro do servidor da Meta melhoram sozinhos.
  if (status === 429 || status >= 500) return false;
  if (codigo === 130429 || codigo === 131056) return false;
  return true;
}


/**
 * Responde em texto livre, DENTRO da janela de 24 horas.
 *
 * So se chama isto em resposta a uma mensagem que a pessoa mandou agora: e o
 * que abre a janela. Chamada fora disso, a Meta devolve 131047 e a mensagem
 * nao chega — e o pior e que o sistema teria achado que respondeu.
 */
export async function responderTexto(
  escritorioId: string,
  para: string,
  texto: string,
): Promise<ResultadoDoEnvio> {
  const credencial = await credencialDoEscritorio(escritorioId);

  let resposta: Response;
  try {
    resposta = await buscarComLimite(
      `${baseMeta()}/${encodeURIComponent(credencial.numeroId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credencial.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: para,
          type: "text",
          // Sem previa de link: a resposta nao leva link, e a previa faria a
          // Meta buscar a pagina no meio do envio.
          text: { preview_url: false, body: texto.slice(0, 4000) },
        }),
      },
    );
  } catch (erro) {
    throw new FalhaNoWhatsapp(descreverFalha(erro), false);
  }

  const json = (await resposta.json().catch(() => null)) as {
    messages?: { id?: string }[];
    error?: { message?: string; code?: number };
  } | null;

  if (!resposta.ok) {
    const codigo = json?.error?.code ?? 0;
    throw new FalhaNoWhatsapp(
      explicar(codigo, json?.error?.message ?? `A Meta respondeu ${resposta.status}.`),
      ehDefinitivo(codigo, resposta.status),
    );
  }

  const id = json?.messages?.[0]?.id;
  if (!id) throw new FalhaNoWhatsapp("A Meta aceitou sem devolver o id da mensagem.", false);
  return { idNaMeta: id };
}

/**
 * Confere a assinatura do webhook da Meta.
 *
 * AO CONTRARIO do webhook da InfinitePay, este e ASSINADO: a Meta manda
 * `X-Hub-Signature-256: sha256=<hmac do corpo cru>`. Entao aqui da para
 * confiar no que chegou — e por isso a resposta automatica pode sair sem uma
 * segunda consulta.
 *
 * O corpo tem de ser o CRU, byte a byte. JSON.parse seguido de
 * JSON.stringify muda espaco e ordem, e a conta nao fecha mais.
 */
export function assinaturaConfere(
  corpoCru: string,
  cabecalho: string | null,
  segredo: string,
): boolean {
  if (!cabecalho || !cabecalho.startsWith("sha256=")) return false;
  const esperado = createHmac("sha256", segredo).update(corpoCru, "utf8").digest("hex");
  const recebido = cabecalho.slice("sha256=".length).trim();
  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(recebido, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
