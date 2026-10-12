import { redirect } from "next/navigation";

// A tela de Honorarios saiu do menu: o contrato de honorarios e cadastrado na
// ficha do cliente, junto da procuracao, da declaracao e do contrato em
// documento, e as parcelas entram sozinhas no financeiro, a receber
// (src/lib/honorarios-na-tela.ts, preverRecebimentos). Link salvo continua
// chegando a algum lugar util.
export default function PaginaHonorarios() {
  redirect("/clientes");
}
