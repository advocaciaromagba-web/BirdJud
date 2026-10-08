import type { Metadata } from "next";
import { Poppins, Source_Serif_4 } from "next/font/google";
import { MARCA_NEUTRA } from "@/lib/escritorio";
import { normalizarCor, paletaDe, variaveisDaPaleta } from "@/lib/identidade";
import { escritorioDoEndereco } from "@/lib/sessao";
import "./globals.css";

// DUAS familias, e nao tres. A Poppins responde por tudo que e interface e
// titulo — menu, botao, tabela, cabecalho de tela. A serifada fica reservada
// ao CORPO de peca e de publicacao, que e texto juridico longo: ali a serifa
// ajuda a ler, e trocar por geometrica so cansaria a vista.
//
// Antes eram Inter (tela) e Playfair (titulo). A Playfair saiu porque
// misturar serifa de display com a interface deixava o sistema com duas
// personalidades; a Poppins nos dois papeis da a unidade pedida.
//
// Baixadas no build e servidas do nosso dominio — nenhuma requisicao do
// navegador do escritorio sai para um terceiro.
const interface_ = Poppins({
  subsets: ["latin"],
  // A Poppins nao tem eixo variavel no Google Fonts: os pesos vao listados,
  // e pedir um que nao esteja aqui faz o navegador engordar a letra sozinho.
  weight: ["300", "400", "500", "600", "700"],
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
      className={`${interface_.variable} ${serifada.variable}`}
    >
      <body
        style={variaveisDaPaleta(paleta) as React.CSSProperties}
      >
        {children}
      </body>
    </html>
  );
}
