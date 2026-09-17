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
      },
    },
  },
  plugins: [],
};

export default config;
