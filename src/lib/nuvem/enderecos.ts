// Os enderecos do ida-e-volta do login na nuvem.
//
// O endereco de retorno e UM, no dominio da plataforma, porque e ele que fica
// registrado no aplicativo da Microsoft e do Google — registrar um por
// escritorio seria impossivel (o escritorio nasce sem ninguem mexer no
// aplicativo). Dali a pessoa e devolvida ao subdominio do escritorio dela.
import { dominioDaPlataforma } from "../dominio";
import type { Provedor } from "./estado";

/** https://birdjud.com.br — ou outro, nos testes e no ensaio. */
export function baseDaPlataforma(): string {
  const definida = process.env.NUVEM_URL_RETORNO?.trim();
  return (definida || `https://${dominioDaPlataforma()}`).replace(/\/$/, "");
}

export function caminhoDoProvedor(provedor: Provedor): string {
  return provedor === "MICROSOFT" ? "microsoft" : "google";
}

export function provedorDoCaminho(caminho: string): Provedor | null {
  if (caminho === "microsoft") return "MICROSOFT";
  if (caminho === "google") return "GOOGLE";
  return null;
}

/** O endereco que vai registrado no aplicativo de cada provedor. */
export function enderecoDeRetorno(provedor: Provedor): string {
  return `${baseDaPlataforma()}/api/nuvem/retorno/${caminhoDoProvedor(provedor)}`;
}

/** https://<slug>.birdjud.com.br, com o mesmo protocolo e porta da base. */
export function baseDoEscritorio(slug: string): string {
  const u = new URL(baseDaPlataforma());
  return `${u.protocol}//${slug}.${u.host}`;
}
