import type { Metadata } from "next";
import { Inter, Playfair_Display, Source_Serif_4 } from "next/font/google";
import { MARCA_NEUTRA } from "@/lib/escritorio";
import { normalizarCor, paletaDe, variaveisDaPaleta } from "@/lib/identidade";
import { escritorioDoEndereco } from "@/lib/sessao";
import "./globals.css";

// Tres familias, com papeis separados: a de tela, que se le o dia inteiro; a
// de titulo, que e identidade da marca e aparece pouco; e a serifada de
// leitura, reservada a texto de peca e de publicacao. Baixadas no build e
// servidas do nosso dominio — nenhuma requisicao do navegador do escritorio
// sai para um terceiro.
const interface_ = Inter({
  subsets: ["latin"],
  variable: "--fonte-interface",
  display: "swap",
});

const titulo = Playfair_Display({
  subsets: ["latin"],
  variable: "--fonte-display",
  display: "swap",
});

const serifada = Source_Serif_4({
  subsets: ["latin"],
  variable: "--fonte-serifada",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BirdJud",
  description:
    "Gestao completa para escritorios de advocacia, com inteligencia artificial.",
  openGraph: {
    title: "BirdJud",
    description:
      "Gestao completa para escritorios de advocacia, com inteligencia artificial.",
    images: ["/marca/quadrado-escuro.jpg"],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // A marca vem do subdominio, nunca de constante no codigo.
  const marca = (await escritorioDoEndereco()) ?? MARCA_NEUTRA;

  // O valor vai para o atributo style, e propriedade personalizada aceita
  // qualquer texto — inclusive o resto de uma regra CSS. Uma linha gravada
  // antes desta conferencia existir, ou por outro caminho, nao pode virar
  // estilo: cor que nao normaliza cai na cor neutra.
  const paleta = paletaDe(
    normalizarCor(marca.corPrimaria) ?? MARCA_NEUTRA.corPrimaria,
    normalizarCor(marca.corSecundaria) ?? MARCA_NEUTRA.corSecundaria,
  );

  return (
    <html
      lang="pt-BR"
      className={`${interface_.variable} ${titulo.variable} ${serifada.variable}`}
    >
      <body
        style={variaveisDaPaleta(paleta) as React.CSSProperties}
      >
        {children}
      </body>
    </html>
  );
}
