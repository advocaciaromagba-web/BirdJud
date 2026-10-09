/**
 * Icones do menu, desenhados aqui mesmo.
 *
 * Sao poucos e nunca mudam: uma biblioteca inteira de icones seria mais
 * megabytes no navegador do escritorio do que o sistema todo.
 */
export type NomeDeIcone =
  | "painel"
  | "passos"
  | "clientes"
  | "processos"
  | "agenda"
  | "publicacoes"
  | "arquivos"
  | "cobrancas"
  | "notas"
  | "financeiro"
  | "usuarios"
  | "integracoes"
  | "conta"
  | "ia"
  | "busca"
  | "prazos"
  | "honorarios"
  | "extrato"
  | "modelos"
  | "configuracoes"
  | "entrevistas"
  | "tarefas"
  | "mensagens";

const TRACOS: Record<NomeDeIcone, string> = {
  mensagens: "M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10l-5 4V6a1 1 0 0 1 1-1Zm3 5h8m-8 3h5",
  painel: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z",
  clientes:
    "M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm11 9v-1a4 4 0 0 0-3-3.9M16 4.1a4 4 0 0 1 0 7.8",
  processos:
    "M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm7 0v5h5M9 13h6M9 17h6",
  agenda:
    "M7 3v3m10-3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z",
  publicacoes:
    "M4 5h13a1 1 0 0 1 1 1v13a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V5Zm4 4h6M8 13h6M8 17h4",
  arquivos:
    "M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z",
  cobrancas: "M3 7h18v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Zm0 4h18M7 15h3",
  notas:
    "M6 3h12a1 1 0 0 1 1 1v17l-3.5-2-3.5 2-3.5-2L5 21V4a1 1 0 0 1 1-1Zm3 6h6M9 13h6",
  financeiro: "M4 19V5m0 14h16M8 15V9m4 6v-9m4 9v-5",
  usuarios:
    "M15 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm9 0h4m-2-2v4",
  integracoes:
    "M10 4H6a2 2 0 0 0-2 2v4m6-6h4m4 0h-4m10 6V6a2 2 0 0 0-2-2m2 6v4m0 4v-4M4 14v4a2 2 0 0 0 2 2h4m4 0h4a2 2 0 0 0 2-2M8 12h8",
  conta: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0",
  // Quatro icones acrescentados em 08/10/2026, quando o menu virou lista
  // plana: Honorarios usava o mesmo de Cobrancas, Conferir extrato o mesmo
  // de Financeiro, Modelos o de Arquivos e Configuracoes o de Integracoes.
  // Em lista agrupada o titulo do grupo separava; em lista plana, dois itens
  // seguidos com o mesmo desenho obrigam a ler cada linha.
  // Balao de conversa com linhas: a entrevista e uma conversa que vira texto.
  // Lista com visto: tarefa e o que se risca.
  // Bandeira num mastro: o caminho ate a chegada.
  passos: "M5 21V4m0 0h11l-2 4 2 4H5",
  tarefas:
    "M9 11l2.5 2.5L16 9M5 4h14a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z",
  entrevistas:
    "M21 14a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Zm-13-5h8M8 12.5h5",
  honorarios:
    "M3 10h18M6 10V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3m-6 4v4m-2-4h4a2 2 0 0 1 0 4h-4M5 10h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z",
  extrato:
    "M5 3h14a1 1 0 0 1 1 1v16l-2.5-1.5L15 20l-2.5-1.5L10 20l-2.5-1.5L5 20V4a1 1 0 0 1 1-1Zm3 5h8M8 12h5m1.5 3.5 1.5 1.5 3-3",
  modelos:
    "M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 0v4h4M8 11h8M8 15h8M8 19h4",
  configuracoes:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8.4-3a8.4 8.4 0 0 0-.14-1.5l2-1.56-2-3.46-2.38.96a8.4 8.4 0 0 0-2.6-1.5L14.9 2h-4l-.38 2.44a8.4 8.4 0 0 0-2.6 1.5L5.54 5 3.5 8.44l2 1.56A8.4 8.4 0 0 0 5.36 12c0 .51.05 1.01.14 1.5l-2 1.56 2.04 3.46 2.38-.96a8.4 8.4 0 0 0 2.6 1.5l.38 2.44h4l.38-2.44a8.4 8.4 0 0 0 2.6-1.5l2.38.96 2-3.46-2-1.56c.09-.49.14-.99.14-1.5Z",
  ia: "M12 3v3m0 12v3M3 12h3m12 0h3M7 7l2 2m6 6 2 2m0-10-2 2m-6 6-2 2M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  prazos:
    "M7 3h10M7 21h10M8 3v4a4 4 0 0 0 4 4 4 4 0 0 0 4-4V3M8 21v-4a4 4 0 0 1 4-4 4 4 0 0 1 4 4v4",
  busca: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5 -2 5 5",
};

export function Icone({
  nome,
  className = "h-5 w-5",
}: {
  nome: NomeDeIcone;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={TRACOS[nome]} />
    </svg>
  );
}
