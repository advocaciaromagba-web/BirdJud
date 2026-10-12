import { redirect } from "next/navigation";

// A tela de Prazos saiu do menu: prazo agora mora na TAREFA, com data de
// entrega e prazo fatal na mesma linha (natureza.ts). Os prazos antigos
// viraram tarefas (separarAgendaETarefas). Link salvo continua chegando.
export default function PaginaPrazos() {
  redirect("/tarefas");
}
