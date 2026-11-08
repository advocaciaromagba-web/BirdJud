import type { Metadata } from "next";
import { ManualDeUso } from "@/componentes/ManualDeUso";

export const metadata: Metadata = {
  title: "Manual de utilização · BirdJud",
  description: "Como usar o BirdJud, tela por tela: agenda, tarefas, publicações, clientes, documentos, cobranças, notas fiscais, financeiro e configurações.",
};

/**
 * Manual de utilizacao, publico: serve a quem ja usa e a quem esta
 * conhecendo. O conteudo mora em src/lib/manual.ts; as telas em
 * public/manual/, capturadas do escritorio de demonstracao.
 */
export default function PaginaDoManual() {
  return <ManualDeUso />;
}
