// Consulta de CEP: o endereco preenchido sozinho a partir do CEP.
//
// Tres servicos publicos, em sequencia, porque nenhum cobre tudo:
//   ViaCEP     — o mais conhecido; NAO conhece CEP geral de cidade pequena
//                (14840-000, Guariba) e responde {"erro": true};
//   BrasilAPI  — agrega varias fontes e cobre esses casos;
//   OpenCEP    — terceiro caminho, se os dois falharem.
// O primeiro que responder com cidade e UF vence.
//
// A consulta passa pelo nosso servidor (a pagina so conversa com o proprio
// dominio, pela politica de seguranca), com resposta guardada em memoria:
// o mesmo CEP digitado de novo nao sai do servidor.
import { buscarComLimite } from "./conectores/tipos";

export type EnderecoDoCep = {
  cep: string;
  logradouro: string | null;
  bairro: string | null;
  cidade: string;
  uf: string;
  /** CEP geral da cidade: sem rua nem bairro, a pessoa digita. */
  geral: boolean;
  fonte: "VIACEP" | "BRASILAPI" | "OPENCEP";
};

export function digitosDoCep(texto: string | null | undefined): string | null {
  const d = (texto ?? "").replace(/\D/g, "");
  return d.length === 8 ? d : null;
}

export function cepComHifen(d: string): string {
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function montar(
  cep: string,
  logradouro: unknown,
  bairro: unknown,
  cidade: unknown,
  uf: unknown,
  fonte: EnderecoDoCep["fonte"],
): EnderecoDoCep | null {
  const c = texto(cidade);
  const u = texto(uf)?.toUpperCase();
  if (!c || !u || !/^[A-Z]{2}$/.test(u)) return null;
  const rua = texto(logradouro);
  return { cep, logradouro: rua, bairro: texto(bairro), cidade: c, uf: u, geral: !rua, fonte };
}

/** Respostas de cada servico, ja no nosso formato. Puras: tem teste. */
export const LER = {
  VIACEP: (cep: string, j: Record<string, unknown>) =>
    j.erro ? null : montar(cep, j.logradouro, j.bairro, j.localidade, j.uf, "VIACEP"),
  BRASILAPI: (cep: string, j: Record<string, unknown>) =>
    montar(cep, j.street, j.neighborhood, j.city, j.state, "BRASILAPI"),
  OPENCEP: (cep: string, j: Record<string, unknown>) =>
    montar(cep, j.logradouro, j.bairro, j.localidade, j.uf, "OPENCEP"),
};

function servicos(cep: string) {
  return [
    { fonte: "VIACEP" as const, url: `${process.env.CEP_VIACEP_URL ?? "https://viacep.com.br/ws"}/${cep}/json/` },
    { fonte: "BRASILAPI" as const, url: `${process.env.CEP_BRASILAPI_URL ?? "https://brasilapi.com.br/api/cep/v2"}/${cep}` },
    { fonte: "OPENCEP" as const, url: `${process.env.CEP_OPENCEP_URL ?? "https://opencep.com/v1"}/${cep}` },
  ];
}

const memoria = new Map<string, { quando: number; endereco: EnderecoDoCep | null }>();
const VALIDADE_MS = 24 * 60 * 60 * 1000;
const MAXIMO_NA_MEMORIA = 5000;

/** O endereco do CEP, ou null quando nenhum servico o conhece. */
export async function buscarCep(entrada: string): Promise<EnderecoDoCep | null> {
  const cep = digitosDoCep(entrada);
  if (!cep) return null;
  const guardado = memoria.get(cep);
  if (guardado && Date.now() - guardado.quando < VALIDADE_MS) return guardado.endereco;

  let achado: EnderecoDoCep | null = null;
  let algumRespondeu = false;
  for (const s of servicos(cep)) {
    try {
      const r = await buscarComLimite(s.url, { headers: { accept: "application/json" } });
      if (r.status === 404 || r.status === 400) {
        algumRespondeu = true;
        continue;
      }
      if (!r.ok) continue;
      algumRespondeu = true;
      const lido = LER[s.fonte](cep, (await r.json()) as Record<string, unknown>);
      if (lido) {
        achado = lido;
        // CEP geral: tenta o proximo, que pode trazer rua; senao fica este.
        if (!lido.geral) break;
      }
    } catch {
      // Servico fora do ar ou lento: tenta o proximo.
    }
  }
  // So guarda "nao existe" quando algum servico de fato respondeu: queda de
  // rede nao pode marcar CEP valido como inexistente por um dia.
  if (achado || algumRespondeu) {
    if (memoria.size >= MAXIMO_NA_MEMORIA) memoria.delete(memoria.keys().next().value!);
    memoria.set(cep, { quando: Date.now(), endereco: achado });
  }
  return achado;
}

/** So para teste. */
export function esquecerCeps() {
  memoria.clear();
}
