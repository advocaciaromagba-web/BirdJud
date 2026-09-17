import type { Metadata } from "next";
import { MARCA_NEUTRA } from "@/lib/escritorio";
import { escritorioDoEndereco } from "@/lib/sessao";
import "./globals.css";

export const metadata: Metadata = {
  title: "BirdJud",
  description: "Sistema juridico white label para escritorios de advocacia",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // A marca vem do subdominio, nunca de constante no codigo.
  const marca = (await escritorioDoEndereco()) ?? MARCA_NEUTRA;

  return (
    <html lang="pt-BR">
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
