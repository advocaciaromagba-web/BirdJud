/**
 * Icones do menu, desenhados aqui mesmo.
 *
 * Sao poucos e nunca mudam: uma biblioteca inteira de icones seria mais
 * megabytes no navegador do escritorio do que o sistema todo.
 */
export type NomeDeIcone =
  | "painel"
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
  | "busca";

const TRACOS: Record<NomeDeIcone, string> = {
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
  ia: "M12 3v3m0 12v3M3 12h3m12 0h3M7 7l2 2m6 6 2 2m0-10-2 2m-6 6-2 2M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
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
