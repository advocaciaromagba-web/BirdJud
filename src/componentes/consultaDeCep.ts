"use client";
// O CEP no navegador: mascara, consulta e o recado que vai embaixo do campo.
// Usado em todo formulario com endereco — o CEP e o primeiro campo, e o resto
// se preenche sozinho, faltando so o numero.

export type EnderecoAchado = {
  cep: string;
  logradouro: string | null;
  bairro: string | null;
  cidade: string;
  uf: string;
  geral: boolean;
};

export type EstadoDoCep =
  | { tipo: "parado" }
  | { tipo: "buscando" }
  | { tipo: "achou"; texto: string; geral: boolean }
  | { tipo: "nao-achou"; texto: string };

/** "14840000" -> "14840-000", enquanto digita. */
export function mascararCep(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

const consultados = new Map<string, EnderecoAchado | null>();

/** null = CEP desconhecido; undefined = nao deu para consultar agora. */
export async function consultarCep(valor: string): Promise<EnderecoAchado | null | undefined> {
  const d = valor.replace(/\D/g, "");
  if (d.length !== 8) return undefined;
  if (consultados.has(d)) return consultados.get(d);
  try {
    const r = await fetch(`/api/cep/${d}`);
    if (r.status === 404) {
      consultados.set(d, null);
      return null;
    }
    if (!r.ok) return undefined;
    const { endereco } = (await r.json()) as { endereco: EnderecoAchado };
    consultados.set(d, endereco);
    return endereco;
  } catch {
    return undefined;
  }
}

export function estadoDepois(achado: EnderecoAchado | null | undefined): EstadoDoCep {
  if (achado === undefined) {
    return { tipo: "nao-achou", texto: "Nao deu para consultar o CEP agora. Preencha o endereco a mao." };
  }
  if (achado === null) {
    return { tipo: "nao-achou", texto: "CEP nao encontrado. Confira os numeros ou preencha o endereco a mao." };
  }
  if (achado.geral) {
    return {
      tipo: "achou",
      geral: true,
      texto: `CEP geral de ${achado.cidade}/${achado.uf}: informe a rua e o numero.`,
    };
  }
  return {
    tipo: "achou",
    geral: false,
    texto: `${achado.logradouro}${achado.bairro ? `, ${achado.bairro}` : ""} — ${achado.cidade}/${achado.uf}. Falta o numero.`,
  };
}

/** Coloca o cursor no campo, depois que o React desenhou os valores novos. */
export function focar(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}
