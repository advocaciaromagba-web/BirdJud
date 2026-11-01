// Busca do campo de cliente (SeletorDeCliente.tsx), separada para ter teste.

export type ClienteParaEscolher = { id: string; nome: string; documento?: string | null };

/** Sem acento e em minusculas: "Joao" acha "João". */
const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Filtra pelo nome (sem acento) ou por parte do CPF/CNPJ. Exportada para teste. */
export function filtrarClientes<T extends ClienteParaEscolher>(clientes: T[], termo: string, limite = 50): T[] {
  const t = normalizar(termo.trim());
  if (!t) return clientes.slice(0, limite);
  const digitos = termo.replace(/\D/g, "");
  return clientes
    .filter(
      (c) =>
        normalizar(c.nome).includes(t) ||
        (digitos.length >= 3 && (c.documento ?? "").replace(/\D/g, "").includes(digitos)),
    )
    .slice(0, limite);
}
