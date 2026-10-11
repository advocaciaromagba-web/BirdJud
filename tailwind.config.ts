import type { Config } from "tailwindcss";

// Sem cor de marca fixa: as cores do escritorio entram como variaveis CSS
// definidas em tempo de execucao a partir da tabela Escritorio.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        marca: "var(--marca-primaria)",
        "marca-2": "var(--marca-secundaria)",
        // O slate-500 padrao (#64748b) fica em 4,4:1 sobre o fundo off-white
        // do sistema — abaixo dos 4,5:1 que texto pequeno exige (WCAG AA).
        // Um degrau mais escuro fecha 5:1 sem mudar o desenho.
        slate: { 500: "#5d6b7f" },
      },
    },
  },
  plugins: [],
};

export default config;
