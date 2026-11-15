// A linha digitavel da conta a pagar (11/11/2026, vindo do sistema da
// Advocacia Roma). Puro: a tela, a rota e o teste usam o mesmo.
//
// 47 digitos e boleto de cobranca; 48 e convenio (agua, energia, telefone,
// tributo). Linha pela metade NAO entra calada: o servidor guardaria um
// numero que o aplicativo do banco recusa, e a pessoa descobriria no dia do
// vencimento.

export type LinhaLida =
  | { ok: true; digitos: string; tipo: "BOLETO" | "CONVENIO" }
  | { ok: false; erro: string };

export function lerLinhaDigitavel(bruto: string | null | undefined): LinhaLida {
  const texto = (bruto ?? "").trim();
  if (!texto) return { ok: false, erro: "Linha digitável vazia." };
  // Pontos, espacos e tracos da mascara saem; qualquer letra denuncia que
  // aquilo nao e a linha (e o codigo de barras "lido" errado, um recado).
  if (/[^\d.\s-]/.test(texto)) return { ok: false, erro: "A linha digitável só tem números. Confira o que foi colado." };
  const digitos = texto.replace(/\D/g, "");
  if (digitos.length === 47) return { ok: true, digitos, tipo: "BOLETO" };
  if (digitos.length === 48) return { ok: true, digitos, tipo: "CONVENIO" };
  return {
    ok: false,
    erro: `A linha digitável tem ${digitos.length} dígitos. Boleto tem 47 e conta de consumo ou tributo tem 48: copie de novo, inteira.`,
  };
}

/** Em blocos, como vem impressa: mais facil de conferir a olho. */
export function formatarLinha(digitos: string): string {
  if (digitos.length === 47) {
    return `${digitos.slice(0, 5)}.${digitos.slice(5, 10)} ${digitos.slice(10, 15)}.${digitos.slice(15, 21)} ${digitos.slice(21, 26)}.${digitos.slice(26, 32)} ${digitos.slice(32, 33)} ${digitos.slice(33)}`;
  }
  if (digitos.length === 48) return digitos.replace(/(\d{11})(\d)/g, "$1-$2 ").trim();
  return digitos;
}
