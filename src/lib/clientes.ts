// Pendencias do cadastro de cliente.
//
// POR QUE ISTO EXISTE: ate aqui a lista de clientes mostrava um traco onde
// faltava dado — e um traco nao diz o que vai acontecer por causa dele. Quem
// olha nao tem como saber que aquele cliente sem CPF e o que vai fazer a
// cobranca falhar no dia do vencimento, nem que aquele sem e-mail nao vai
// receber o link de pagamento nenhum.
//
// A LICAO VEM DE ANTES, do CNPJ do proprio escritorio: o campo existia, estava
// vazio, e o custo so apareceria na primeira fatura — o escritorio devendo uma
// cobranca que nunca lhe foi apresentada. Dizer "falta CNPJ" nao basta; o que
// serve e dizer "sem isto a cobranca nao sai".
//
// REGRA QUE DECIDE O QUE VIRA PENDENCIA: so acusamos falta que custa alguma
// coisa NESTE escritorio. Pendencia de WhatsApp em escritorio que nao contratou
// WhatsApp e ruido, e ruido ensina a ignorar a lista inteira — a mesma razao
// pela qual o vigia nao acusa o que nao tem certeza.
import { documentoValido } from "./documentos";
import type { Modulo } from "./catalogo";

export type GravidadeDaPendencia =
  /** Alguma coisa NAO VAI funcionar enquanto isto faltar. */
  | "IMPEDE"
  /** Funciona, mas por um caminho pior. */
  | "LIMITA"
  /** Vale saber; nao quebra nada. */
  | "AVISO";

export type PendenciaDoCliente = {
  /** Chave estavel: a tela e o teste nao dependem do texto. */
  tipo:
    | "SEM_DOCUMENTO"
    | "DOCUMENTO_INVALIDO"
    | "SEM_EMAIL"
    | "SEM_TELEFONE"
    | "SEM_ARQUIVO";
  gravidade: GravidadeDaPendencia;
  /** O que falta E o que acontece por causa disso. Nunca so o que falta. */
  texto: string;
};

export type DadosDoCliente = {
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
};

const ORDEM: Record<GravidadeDaPendencia, number> = {
  IMPEDE: 0,
  LIMITA: 1,
  AVISO: 2,
};

function vazio(valor: string | null | undefined): boolean {
  return !valor || !valor.trim();
}

/**
 * O que falta neste cliente, e o que isso custa.
 *
 * `modulos` sao os do ESCRITORIO: e o que separa falta que importa de falta
 * que nao importa aqui.
 */
export function pendenciasDoCliente(
  cliente: DadosDoCliente,
  modulos: readonly Modulo[],
  contagens: { arquivos: number } = { arquivos: 0 },
): PendenciaDoCliente[] {
  const tem = (m: Modulo) => modulos.includes(m);
  const cobra = tem("COBRANCAS");
  const pendencias: PendenciaDoCliente[] = [];

  if (vazio(cliente.documento)) {
    pendencias.push({
      tipo: "SEM_DOCUMENTO",
      // Com cobranca contratada isto IMPEDE: o meio de pagamento exige CPF ou
      // CNPJ para emitir, e a recusa so apareceria no dia do vencimento.
      gravidade: cobra ? "IMPEDE" : "AVISO",
      texto: cobra
        ? "Sem CPF ou CNPJ nao da para emitir cobranca para este cliente."
        : "Sem CPF ou CNPJ. Nao atrapalha hoje, mas sera exigido para cobrar.",
    });
  } else if (!documentoValido(cliente.documento!)) {
    pendencias.push({
      tipo: "DOCUMENTO_INVALIDO",
      // Pior que faltar: parece preenchido. A recusa viria do provedor, com
      // uma mensagem que ninguem liga a este cadastro.
      gravidade: cobra ? "IMPEDE" : "AVISO",
      texto:
        "O CPF/CNPJ nao fecha o digito verificador. Confira: digitado errado, " +
        "ele passa no cadastro e e recusado na hora de cobrar.",
    });
  }

  if (vazio(cliente.email)) {
    const precisa = cobra || tem("EMAIL");
    pendencias.push({
      tipo: "SEM_EMAIL",
      gravidade: precisa ? "LIMITA" : "AVISO",
      texto: cobra
        ? "Sem e-mail, o link de pagamento nao chega a este cliente."
        : precisa
          ? "Sem e-mail, os avisos deste cliente nao tem para onde ir."
          : "Sem e-mail cadastrado.",
    });
  }

  if (vazio(cliente.telefone)) {
    const zap = tem("WHATSAPP");
    pendencias.push({
      tipo: "SEM_TELEFONE",
      gravidade: zap ? "LIMITA" : "AVISO",
      texto: zap
        ? "Sem telefone, o aviso por WhatsApp nao sai para este cliente."
        : "Sem telefone cadastrado.",
    });
  }

  if (contagens.arquivos === 0) {
    pendencias.push({
      tipo: "SEM_ARQUIVO",
      gravidade: "AVISO",
      texto:
        "Nenhum documento anexado. Nao ha o que conferir se o cadastro bater " +
        "com o papel.",
    });
  }

  // Primeiro o que impede, depois o que limita. Quem abre a ficha tem de ver
  // de cara o que quebra, nao o que e so bom ter.
  return pendencias.sort((a, b) => ORDEM[a.gravidade] - ORDEM[b.gravidade]);
}

/** Quantas pendencias impedem alguma coisa. E o que a lista mostra. */
export function quantasImpedem(pendencias: PendenciaDoCliente[]): number {
  return pendencias.filter((p) => p.gravidade === "IMPEDE").length;
}
