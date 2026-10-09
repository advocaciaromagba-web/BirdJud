// OneDrive, pelo Microsoft Graph.
//
// Autoridade "common": vale conta pessoal (hotmail, outlook) E conta de
// trabalho ou escola (Microsoft 365). O escritorio pequeno usa a primeira, o
// medio a segunda, e o aplicativo da plataforma e um so para os dois.
//
// Escopo Files.ReadWrite: o escritorio ve no OneDrive tudo que o sistema
// cria, e o sistema ve o que o escritorio poe na pasta do cliente.
import { buscarComLimite } from "../conectores/tipos";
import {
  FalhaNaNuvem,
  type ContaConectada,
  type ItemNaNuvem,
  type Nuvem,
  type Pasta,
  type Tokens,
} from "./tipos";

const ESCOPOS = "offline_access Files.ReadWrite User.Read";

function login(): string {
  return (process.env.MICROSOFT_LOGIN_URL ?? "https://login.microsoftonline.com/common/oauth2/v2.0").replace(/\/$/, "");
}
function graph(): string {
  return (process.env.MICROSOFT_GRAPH_URL ?? "https://graph.microsoft.com/v1.0").replace(/\/$/, "");
}

/** Acima disso o Graph exige sessao de envio em pedacos. */
const LIMITE_ENVIO_SIMPLES = 4 * 1024 * 1024;
/** Multiplo de 320 KiB, exigencia do Graph: 16 x 320 KiB. */
const PEDACO = 5 * 1024 * 1024;

async function token(corpo: Record<string, string>): Promise<Record<string, unknown>> {
  const r = await buscarComLimite(`${login()}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
      client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
      scope: ESCOPOS,
      ...corpo,
    }),
  });
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    const codigo = String(json.error ?? "");
    throw new FalhaNaNuvem(
      codigo === "invalid_grant"
        ? "A Microsoft recusou o acesso guardado (revogado ou vencido). Conecte o OneDrive de novo."
        : `A Microsoft recusou o pedido (${r.status} ${codigo}).`,
      r.status,
      codigo === "invalid_grant",
    );
  }
  return json;
}

async function chamar(acesso: string, caminho: string, init: RequestInit = {}): Promise<Response> {
  return buscarComLimite(`${graph()}${caminho}`, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${acesso}` },
  });
}

function falha(r: Response, oQue: string): FalhaNaNuvem {
  return new FalhaNaNuvem(`OneDrive: nao foi possivel ${oQue} (${r.status}).`, r.status);
}

async function filhos(acesso: string, paiId: string | null): Promise<ItemNaNuvem[]> {
  const base = paiId ? `/me/drive/items/${encodeURIComponent(paiId)}/children` : "/me/drive/root/children";
  let proxima: string | null = `${graph()}${base}?$select=id,name,folder,createdDateTime,webUrl&$top=200`;
  const itens: ItemNaNuvem[] = [];
  // Pagina por pagina: a raiz de quem usa o OneDrive ha anos nao cabe em uma.
  while (proxima) {
    const r: Response = await buscarComLimite(proxima, { headers: { authorization: `Bearer ${acesso}` } });
    if (!r.ok) throw falha(r, "listar a pasta");
    const json = (await r.json()) as { value?: Record<string, unknown>[]; "@odata.nextLink"?: string };
    for (const i of json.value ?? []) {
      itens.push({
        id: String(i.id),
        nome: String(i.name),
        pasta: Boolean(i.folder),
        criadoEm: (i.createdDateTime as string) ?? null,
        endereco: (i.webUrl as string) ?? null,
      });
    }
    proxima = json["@odata.nextLink"] ?? null;
  }
  return itens;
}

export const onedrive: Nuvem = {
  provedor: "MICROSOFT",
  rotulo: "OneDrive",

  configurada() {
    return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
  },

  urlDeAutorizacao(estado, retorno) {
    const p = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
      response_type: "code",
      redirect_uri: retorno,
      response_mode: "query",
      scope: ESCOPOS,
      state: estado,
      // Sem isto, quem ja tem uma conta Microsoft aberta no navegador entra
      // nela sem escolher — e liga ao escritorio a conta pessoal errada.
      prompt: "select_account",
    });
    return `${login()}/authorize?${p}`;
  },

  async trocarCodigo(codigo, retorno): Promise<ContaConectada> {
    const json = await token({ grant_type: "authorization_code", code: codigo, redirect_uri: retorno });
    const renovacao = json.refresh_token as string | undefined;
    if (!renovacao) {
      throw new FalhaNaNuvem("A Microsoft nao devolveu acesso permanente. Tente conectar de novo.", 400);
    }
    let conta: string | null = null;
    const eu = await chamar(String(json.access_token), "/me?$select=userPrincipalName,mail");
    if (eu.ok) {
      const d = (await eu.json()) as { mail?: string; userPrincipalName?: string };
      conta = d.mail ?? d.userPrincipalName ?? null;
    }
    return { renovacao, conta };
  },

  async renovar(renovacao): Promise<Tokens> {
    const json = await token({ grant_type: "refresh_token", refresh_token: renovacao });
    const nova = json.refresh_token as string | undefined;
    return { acesso: String(json.access_token), renovacao: nova && nova !== renovacao ? nova : undefined };
  },

  async garantirPasta(acesso, paiId, nome): Promise<Pasta> {
    const alvo = paiId ? `/me/drive/items/${encodeURIComponent(paiId)}/children` : "/me/drive/root/children";
    const r = await chamar(acesso, alvo, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nome, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    });
    if (r.ok) {
      const d = (await r.json()) as { id: string; webUrl?: string };
      return { id: d.id, endereco: d.webUrl ?? null };
    }
    // 409 = ja existe com esse nome: usa a que esta la, nao cria "Clientes 1".
    if (r.status === 409) {
      const achada = (await filhos(acesso, paiId)).find(
        (i) => i.pasta && i.nome.toLowerCase() === nome.toLowerCase(),
      );
      if (achada) return { id: achada.id, endereco: achada.endereco };
    }
    throw falha(r, `criar a pasta "${nome}"`);
  },

  async pastaExiste(acesso, id) {
    const r = await chamar(acesso, `/me/drive/items/${encodeURIComponent(id)}?$select=id,webUrl,folder,deleted`);
    if (r.status === 404) return null;
    if (!r.ok) throw falha(r, "abrir a pasta");
    const d = (await r.json()) as { id: string; webUrl?: string; folder?: unknown; deleted?: unknown };
    if (!d.folder || d.deleted) return null;
    return { id: d.id, endereco: d.webUrl ?? null };
  },

  async enviar(acesso, pastaId, nome, _tipo, conteudo) {
    const caminho = `/me/drive/items/${encodeURIComponent(pastaId)}:/${encodeURIComponent(nome)}:`;
    if (conteudo.byteLength <= LIMITE_ENVIO_SIMPLES) {
      // rename: documento com o mesmo nome vira "nome 1.pdf", nunca sobrescreve.
      const r = await chamar(acesso, `${caminho}/content?@microsoft.graph.conflictBehavior=rename`, {
        method: "PUT",
        headers: { "content-type": "application/octet-stream" },
        body: new Uint8Array(conteudo),
      });
      if (!r.ok) throw falha(r, `enviar "${nome}"`);
      return { id: String(((await r.json()) as { id: string }).id) };
    }

    const sessao = await chamar(acesso, `${caminho}/createUploadSession`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename" } }),
    });
    if (!sessao.ok) throw falha(sessao, `iniciar o envio de "${nome}"`);
    const { uploadUrl } = (await sessao.json()) as { uploadUrl: string };

    let id = "";
    for (let inicio = 0; inicio < conteudo.byteLength; inicio += PEDACO) {
      const fim = Math.min(inicio + PEDACO, conteudo.byteLength);
      // O uploadUrl ja leva a propria autorizacao: com o cabecalho Bearer
      // junto, o Graph recusa.
      const r = await buscarComLimite(uploadUrl, {
        method: "PUT",
        headers: {
          "content-length": String(fim - inicio),
          "content-range": `bytes ${inicio}-${fim - 1}/${conteudo.byteLength}`,
        },
        body: new Uint8Array(conteudo.subarray(inicio, fim)),
      });
      if (!r.ok && r.status !== 202) throw falha(r, `enviar "${nome}"`);
      if (r.status === 200 || r.status === 201) {
        id = String(((await r.json()) as { id: string }).id);
      }
    }
    return { id };
  },

  listar(acesso, pastaId) {
    return filhos(acesso, pastaId);
  },
};
