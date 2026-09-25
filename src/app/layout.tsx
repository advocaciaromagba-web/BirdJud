import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { MARCA_NEUTRA } from "@/lib/escritorio";
import { escritorioDoEndereco } from "@/lib/sessao";
import "./globals.css";

// Duas familias, com papeis separados: a de tela, que se le o dia inteiro, e
// a serifada, reservada a texto de peca e de publicacao. Baixadas no build e
// servidas do nosso dominio — nenhuma requisicao do navegador do escritorio
// sai para um terceiro.
const interface_ = Inter({
  subsets: ["latin"],
  variable: "--fonte-interface",
  display: "swap",
});

const serifada = Source_Serif_4({
  subsets: ["latin"],
  variable: "--fonte-serifada",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BirdJud",
  description: "Sistema juridico white label para escritorios de advocacia",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // A marca vem do subdominio, nunca de constante no codigo.
  const marca = (await escritorioDoEndereco()) ?? MARCA_NEUTRA;

  return (
    <html
      lang="pt-BR"
      className={`${interface_.variable} ${serifada.variable}`}
    >
      <body
        style={
          {
            "--marca-primaria": marca.corPrimaria,
            "--marca-secundaria": marca.corSecundaria,
          } as React.CSSProperties
        }
      >
        {children}
      </body>
    </html>
  );
}
