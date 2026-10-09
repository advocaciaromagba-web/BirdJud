// Google Drive, pela API v3.
//
// Escopo drive.file, e nao drive: o sistema ve so o que ele mesmo criou ou o
// que o escritorio abriu por ele. Parece limitacao e e protecao — o escopo
// amplo exige do Google uma auditoria de seguranca paga, e daria ao sistema
// leitura do Drive inteiro do escritorio, inclusive o que nada tem com
// cliente. O escritorio continua vendo e mexendo em tudo pelo Drive; o
// sistema le de volta apenas o que ele mesmo pos la.
import { buscarComLimite } from "../conectores/tipos";
import {
  FalhaNaNuvem,
  type ContaConectada,
  type ItemNaNuvem,
  type Nuvem,
  type Pasta,
  type Tokens,
} from "./tipos";

const ESCOPOS = "openid email https://www.googleapis.com/auth/drive.file";
const TIPO_PASTA = "application/vnd.google-apps.folder";

function autorizar(): string {
  return process.env.GOOGLE_AUTH_URL ?? "https://accounts.google.com/o/oauth2/v2/auth";
}
function tokenUrl(): string {
  return process.env.GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token";
}
function drive(): string {
  return (process.env.GOOGLE_DRIVE_URL ?? "https://www.googleapis.com/drive/v3").replace(/\/$/, "");
}
function envio(): string {
  return (process.env.GOOGLE_UPLOAD_URL ?? "https://www.googleapis.com/upload/drive/v3").replace(/\/$/, "");
}

async function token(corpo: Record<string, string>): Promise<Record<string, unknown>> {
  const r = await buscarComLimite(tokenUrl(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      ...corpo,
    }),
  });
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    const codigo = String(json.error ?? "");
    throw new FalhaNaNuvem(
      codigo === "invalid_grant"
        ? "O Google recusou o acesso guardado (revogado ou vencido). Conecte o Google Drive de novo."
        : `O Google recusou o pedido (${r.status} ${codigo}).`,
      r.status,
      codigo === "invalid_grant",
    );
  }
  return json;
}

function falha(r: Response, oQue: string): FalhaNaNuvem {
  return new FalhaNaNuvem(`Google Drive: nao foi possivel ${oQue} (${r.status}).`, r.status);
}

/** Aspas simples e barra invertida escapadas, como a busca do Drive pede. */
export function aspasDoDrive(texto: string): string {
  return texto.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** O e-mail que vem no id_token. Veio direto do Google, por TLS: so decodifica. */
export function emailDoIdToken(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  const meio = idToken.split(".")[1];
  if (!meio) return null;
  try {
    const d = JSON.parse(Buffer.from(meio, "base64url").toString("utf8")) as { email?: string };
    return d.email ?? null;
  } catch {
    return null;
  }
}

async function chamar(acesso: string, url: string, init: RequestInit = {}): Promise<Response> {
  return buscarComLimite(url, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${acesso}` },
  });
}

async function buscar(acesso: string, q: string): Promise<ItemNaNuvem[]> {
  const itens: ItemNaNuvem[] = [];
  let pagina: string | undefined;
  do {
    const p = new URLSearchParams({
      q,
      fields: "nextPageToken,files(id,name,mimeType,createdTime,webViewLink)",
      pageSize: "200",
      spaces: "drive",
    });
    if (pagina) p.set("pageToken", pagina);
    const r = await chamar(acesso, `${drive()}/files?${p}`);
    if (!r.ok) throw falha(r, "listar a pasta");
    const json = (await r.json()) as { files?: Record<string, string>[]; nextPageToken?: string };
    for (const f of json.files ?? []) {
      itens.push({
        id: f.id,
        nome: f.name,
        pasta: f.mimeType === TIPO_PASTA,
        criadoEm: f.createdTime ?? null,
        endereco: f.webViewLink ?? null,
      });
    }
    pagina = json.nextPageToken;
  } while (pagina);
  return itens;
}

export const googleDrive: Nuvem = {
  provedor: "GOOGLE",
  rotulo: "Google Drive",

  configurada() {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  },

  urlDeAutorizacao(estado, retorno) {
    const p = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      response_type: "code",
      redirect_uri: retorno,
      scope: ESCOPOS,
      state: estado,
      // offline + consent: sem os dois, o Google so devolve o token de
      // renovacao na PRIMEIRA vez — e quem reconecta fica sem.
      access_type: "offline",
      prompt: "consent select_account",
      include_granted_scopes: "true",
    });
    return `${autorizar()}?${p}`;
  },

  async trocarCodigo(codigo, retorno): Promise<ContaConectada> {
    const json = await token({ grant_type: "authorization_code", code: codigo, redirect_uri: retorno });
    const renovacao = json.refresh_token as string | undefined;
    if (!renovacao) {
      throw new FalhaNaNuvem("O Google nao devolveu acesso permanente. Tente conectar de novo.", 400);
    }
    const escopo = String(json.scope ?? "");
    if (!escopo.includes("drive.file")) {
      // A tela do Google deixa desmarcar a permissao do Drive. Conectar assim
      // daria uma conta ligada que nao consegue criar uma pasta.
      throw new FalhaNaNuvem(
        "A permissao para o Google Drive ficou desmarcada. Conecte de novo e deixe a caixa do Drive marcada.",
        400,
      );
    }
    return { renovacao, conta: emailDoIdToken(json.id_token) };
  },

  async renovar(renovacao): Promise<Tokens> {
    const json = await token({ grant_type: "refresh_token", refresh_token: renovacao });
    return { acesso: String(json.access_token) };
  },

  async garantirPasta(acesso, paiId, nome): Promise<Pasta> {
    const pai = paiId ?? "root";
    const achadas = await buscar(
      acesso,
      `name = '${aspasDoDrive(nome)}' and '${aspasDoDrive(pai)}' in parents and mimeType = '${TIPO_PASTA}' and trashed = false`,
    );
    if (achadas[0]) return { id: achadas[0].id, endereco: achadas[0].endereco };

    const r = await chamar(acesso, `${drive()}/files?fields=id,webViewLink`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nome, mimeType: TIPO_PASTA, parents: [pai] }),
    });
    if (!r.ok) throw falha(r, `criar a pasta "${nome}"`);
    const d = (await r.json()) as { id: string; webViewLink?: string };
    return { id: d.id, endereco: d.webViewLink ?? null };
  },

  async pastaExiste(acesso, id) {
    const r = await chamar(acesso, `${drive()}/files/${encodeURIComponent(id)}?fields=id,webViewLink,trashed,mimeType`);
    if (r.status === 404) return null;
    if (!r.ok) throw falha(r, "abrir a pasta");
    const d = (await r.json()) as { id: string; webViewLink?: string; trashed?: boolean; mimeType?: string };
    if (d.trashed || d.mimeType !== TIPO_PASTA) return null;
    return { id: d.id, endereco: d.webViewLink ?? null };
  },

  async enviar(acesso, pastaId, nome, tipo, conteudo) {
    // Envio retomavel em um pedido so: serve de 1 byte a 25 MB, e o
    // "multipart" do Drive para em 5 MB.
    const inicio = await chamar(acesso, `${envio()}/files?uploadType=resumable&fields=id`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-type": tipo || "application/octet-stream",
        "x-upload-content-length": String(conteudo.byteLength),
      },
      body: JSON.stringify({ name: nome, parents: [pastaId] }),
    });
    if (!inicio.ok) throw falha(inicio, `iniciar o envio de "${nome}"`);
    const destino = inicio.headers.get("location");
    if (!destino) throw new FalhaNaNuvem("Google Drive nao devolveu o endereco de envio.", 502);

    const r = await chamar(acesso, destino, {
      method: "PUT",
      headers: { "content-type": tipo || "application/octet-stream" },
      body: new Uint8Array(conteudo),
    });
    if (!r.ok) throw falha(r, `enviar "${nome}"`);
    return { id: String(((await r.json()) as { id: string }).id) };
  },

  listar(acesso, pastaId) {
    return buscar(acesso, `'${aspasDoDrive(pastaId)}' in parents and trashed = false`);
  },
};
