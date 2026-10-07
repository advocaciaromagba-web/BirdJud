// Assinatura eletronica pelo Autentique.
//
// O conector em conectores/autentique.ts so guarda e testa o token. Aqui e o
// envio de verdade: a peca sai daqui em PDF e volta como um documento com um
// link de assinatura para cada signatario.
//
// DUAS COISAS MUDAM O DESENHO DESTE ARQUIVO:
//
// 1. CADA ENVIO CUSTA DINHEIRO ao escritorio — o plano do Autentique e dele, e
//    e cobrado por documento. Dois cliques no mesmo botao nao podem virar dois
//    contratos enviados ao cliente. Por isso nada aqui envia sozinho, e um
//    envio repetido da mesma peca para o mesmo cliente exige confirmacao.
//
// 2. O ENVIO E IRREVERSIVEL do ponto de vista do cliente: o e-mail sai na hora.
//    Nao da para "desfazer" uma procuracao mandada para assinar por engano,
//    entao tudo que da para conferir e conferido ANTES — signatario sem
//    e-mail, e-mail torto, peca com campo em branco.
//
// O protocolo e GraphQL com upload de arquivo (graphql-multipart-request-spec):
// um campo `operations` com a consulta, um campo `map` dizendo em qual variavel
// o arquivo entra, e o arquivo.
import type { Especie } from "./modelos";
import { buscarComLimite, descreverFalha } from "./conectores/tipos";

export function baseAutentique(): string {
  return process.env.AUTENTIQUE_BASE_URL ?? "https://api.autentique.com.br/v2/graphql";
}

/** O que o signatario faz com o documento. */
export type Acao = "SIGN" | "APPROVE" | "RECOGNIZE" | "SIGN_AS_A_WITNESS";

export type Signatario = {
  nome: string;
  email: string;
  acao: Acao;
  /** So de volta do Autentique. */
  link?: string | null;
  assinadoEm?: string | null;
  recusadoEm?: string | null;
};

/**
 * Quem assina cada especie, por padrao.
 *
 * Nao e detalhe de tela: e de quem e a assinatura que o documento precisa ter
 * para valer. A procuracao e ato do OUTORGANTE — quem assina e o cliente, e o
 * advogado nao assina a propria procuracao. A declaracao de hipossuficiencia e
 * declaracao DELE, sob a responsabilidade dele. O recibo e o contrario: quem
 * da quitacao e quem recebeu, o escritorio. So o contrato e bilateral.
 *
 * A tela deixa mudar. O padrao e o que esta certo na maioria das vezes, nao
 * uma regra que o sistema impoe.
 */
export const ASSINA_POR_PADRAO: Record<Especie, "CLIENTE" | "ESCRITORIO" | "AMBOS"> = {
  CONTRATO: "AMBOS",
  PROCURACAO: "CLIENTE",
  DECLARACAO: "CLIENTE",
  RECIBO: "ESCRITORIO",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function ehEmail(valor: string | null | undefined): boolean {
  return typeof valor === "string" && EMAIL.test(valor.trim());
}

type Pessoa = { nome: string; email: string | null };

/**
 * A lista de signatarios da peca, sem repetido e sem vazio.
 *
 * Repetido importa: o advogado que tambem e o contato do cliente apareceria
 * duas vezes, receberia dois e-mails e teria de assinar o mesmo documento
 * duas vezes. O Autentique conta por signatario.
 */
export function montarSignatarios(
  especie: Especie,
  cliente: Pessoa,
  advogados: Pessoa[],
  quem: "CLIENTE" | "ESCRITORIO" | "AMBOS" = ASSINA_POR_PADRAO[especie],
): Signatario[] {
  const lista: Signatario[] = [];
  if (quem === "CLIENTE" || quem === "AMBOS") {
    lista.push({ nome: cliente.nome, email: (cliente.email ?? "").trim(), acao: "SIGN" });
  }
  if (quem === "ESCRITORIO" || quem === "AMBOS") {
    for (const a of advogados) {
      lista.push({ nome: a.nome, email: (a.email ?? "").trim(), acao: "SIGN" });
    }
  }

  const vistos = new Set<string>();
  return lista.filter((s) => {
    const chave = s.email.toLowerCase();
    if (chave !== "" && vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

/**
 * Por que este envio nao pode sair.
 *
 * Devolve TODOS os motivos, nao o primeiro: quem esta na tela corrige tudo de
 * uma vez em vez de descobrir o proximo problema a cada tentativa.
 */
export function impedimentosDoEnvio(signatarios: Signatario[]): string[] {
  const motivos: string[] = [];
  if (signatarios.length === 0) {
    motivos.push("Nenhum signatario: nao ha quem assine.");
  }
  for (const s of signatarios) {
    if (s.email === "") {
      motivos.push(`${s.nome} esta sem e-mail no cadastro.`);
    } else if (!ehEmail(s.email)) {
      motivos.push(`O e-mail de ${s.nome} nao parece um e-mail: ${s.email}.`);
    }
  }
  return motivos;
}

export class AutentiqueRecusou extends Error {
  readonly status = 422;
  constructor(motivo: string) {
    super(motivo);
    this.name = "AutentiqueRecusou";
  }
}

const CONSULTA_CRIAR = `mutation CriarDocumento($documento: DocumentInput!, $signatarios: [SignerInput!]!, $arquivo: Upload!) {
  createDocument(document: $documento, signers: $signatarios, file: $arquivo) {
    id
    name
    signatures { public_id name email link { short_link } signed { created_at } rejected { created_at } }
  }
}`;

const CONSULTA_VER = `query VerDocumento($id: UUID!) {
  document(id: $id) {
    id
    name
    signatures { public_id name email link { short_link } signed { created_at } rejected { created_at } }
  }
}`;

/**
 * O corpo da parte `operations` do envio.
 *
 * Separado do envio porque e exatamente o pedaco que da para conferir sem
 * rede: a variavel do arquivo precisa chegar NULA aqui e ser apontada pelo
 * `map` — mandar o arquivo dentro do JSON e o engano classico, e o servidor
 * responde com um erro que nao explica nada.
 */
export function operacoesDoEnvio(
  nome: string,
  signatarios: Signatario[],
  mensagem?: string | null,
): { operations: string; map: string } {
  return {
    operations: JSON.stringify({
      query: CONSULTA_CRIAR,
      variables: {
        documento: {
          name: nome.slice(0, 255),
          ...(mensagem ? { message: mensagem.slice(0, 1000) } : {}),
        },
        signatarios: signatarios.map((s) => ({
          email: s.email.trim().toLowerCase(),
          action: s.acao,
          name: s.nome.slice(0, 255),
        })),
        arquivo: null,
      },
    }),
    map: JSON.stringify({ arquivo: ["variables.arquivo"] }),
  };
}

type AssinaturaDoProvedor = {
  public_id?: string;
  name?: string;
  email?: string;
  link?: { short_link?: string | null } | null;
  signed?: { created_at?: string } | null;
  rejected?: { created_at?: string } | null;
};

type DocumentoDoProvedor = {
  id?: string;
  name?: string;
  signatures?: AssinaturaDoProvedor[] | null;
};

export type Situacao = "ENVIADO" | "PARCIAL" | "ASSINADO" | "RECUSADO";

/**
 * Em que pe esta o documento.
 *
 * Recusa de UM signatario derruba o documento inteiro, e por isso vem antes de
 * tudo: um contrato em que o cliente recusou nao esta "parcialmente assinado",
 * esta recusado, e quem olha a tela precisa ver isso e nao um numero bonito.
 */
export function situacaoDoDocumento(signatarios: Signatario[]): Situacao {
  if (signatarios.length === 0) return "ENVIADO";
  if (signatarios.some((s) => s.recusadoEm)) return "RECUSADO";
  if (signatarios.every((s) => s.assinadoEm)) return "ASSINADO";
  if (signatarios.some((s) => s.assinadoEm)) return "PARCIAL";
  return "ENVIADO";
}

function lerDocumento(d: DocumentoDoProvedor): DocumentoEnviado {
  const signatarios: Signatario[] = (d.signatures ?? []).map((s) => ({
    nome: s.name ?? "",
    email: s.email ?? "",
    acao: "SIGN",
    link: s.link?.short_link ?? null,
    assinadoEm: s.signed?.created_at ?? null,
    recusadoEm: s.rejected?.created_at ?? null,
  }));
  return {
    id: d.id ?? "",
    nome: d.name ?? "",
    signatarios,
    situacao: situacaoDoDocumento(signatarios),
  };
}

export type DocumentoEnviado = {
  id: string;
  nome: string;
  signatarios: Signatario[];
  situacao: Situacao;
};

/** GraphQL responde 200 mesmo com erro: o corpo e que diz. */
function conferirCorpo(corpo: {
  data?: unknown;
  errors?: Array<{ message?: string }>;
}): void {
  if (corpo.errors?.length) {
    throw new AutentiqueRecusou(corpo.errors[0]?.message ?? "O Autentique recusou o envio.");
  }
}

export async function enviarDocumento(
  token: string,
  peca: {
    nome: string;
    nomeDoArquivo: string;
    arquivo: Buffer;
    signatarios: Signatario[];
    mensagem?: string | null;
  },
): Promise<DocumentoEnviado> {
  const impedimentos = impedimentosDoEnvio(peca.signatarios);
  if (impedimentos.length > 0) throw new AutentiqueRecusou(impedimentos.join(" "));

  const { operations, map } = operacoesDoEnvio(peca.nome, peca.signatarios, peca.mensagem);
  const corpo = new FormData();
  corpo.set("operations", operations);
  corpo.set("map", map);
  corpo.set(
    "arquivo",
    new Blob([new Uint8Array(peca.arquivo)], { type: "application/pdf" }),
    peca.nomeDoArquivo,
  );

  let resposta: Response;
  try {
    resposta = await buscarComLimite(baseAutentique(), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: corpo,
    });
  } catch (erro) {
    throw new AutentiqueRecusou(descreverFalha(erro));
  }

  if (resposta.status === 401 || resposta.status === 403) {
    throw new AutentiqueRecusou(
      "O Autentique recusou o token. Reconecte a integracao em Integracoes.",
    );
  }
  if (!resposta.ok) {
    throw new AutentiqueRecusou(`O Autentique respondeu ${resposta.status}.`);
  }

  const json = (await resposta.json().catch(() => null)) as {
    data?: { createDocument?: DocumentoDoProvedor };
    errors?: Array<{ message?: string }>;
  } | null;
  if (!json) throw new AutentiqueRecusou("O Autentique respondeu algo que nao e JSON.");
  conferirCorpo(json);

  const documento = json.data?.createDocument;
  if (!documento?.id) {
    throw new AutentiqueRecusou("O Autentique respondeu sem o documento.");
  }
  return lerDocumento(documento);
}

export async function consultarDocumento(
  token: string,
  id: string,
): Promise<DocumentoEnviado> {
  let resposta: Response;
  try {
    resposta = await buscarComLimite(baseAutentique(), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: CONSULTA_VER, variables: { id } }),
    });
  } catch (erro) {
    throw new AutentiqueRecusou(descreverFalha(erro));
  }
  if (!resposta.ok) throw new AutentiqueRecusou(`O Autentique respondeu ${resposta.status}.`);

  const json = (await resposta.json().catch(() => null)) as {
    data?: { document?: DocumentoDoProvedor };
    errors?: Array<{ message?: string }>;
  } | null;
  if (!json) throw new AutentiqueRecusou("O Autentique respondeu algo que nao e JSON.");
  conferirCorpo(json);

  const documento = json.data?.document;
  if (!documento?.id) throw new AutentiqueRecusou("Documento nao encontrado no Autentique.");
  return lerDocumento(documento);
}
