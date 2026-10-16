// Logotipo novo -> cor principal e de destaque pela paleta do logo.
//
// O caso que importa e o real: o logotipo do proprio BirdJud tem cores
// conhecidas (azul profundo #0B1F3B e ouro #D4AF7C, docs/MARCA.md), sobre
// fundo claro, com antisserrilhado — o que um escritorio de verdade manda.
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { coresDoLogo } from "@/lib/cores-do-logo";
import { luminancia, paraRgb } from "@/lib/identidade";

const perto = (a: string, b: string, tolerancia = 40) => {
  const x = paraRgb(a);
  const y = paraRgb(b);
  return Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b) <= tolerancia;
};

const svg = (corpo: string, fundo = "") =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120">${fundo}${corpo}</svg>`,
  );

const png = (b: Buffer) => sharp(b).png().toBuffer();

describe("cores pelo logotipo", () => {
  it("o logotipo do BirdJud: azul quase preto na principal, ouro no destaque", async () => {
    const cores = await coresDoLogo(readFileSync("public/marca/horizontal.png"));
    expect(cores).not.toBeNull();
    // O passaro e o "BIRD" sao azul quase preto: escuro, puxado para o azul.
    const p = paraRgb(cores!.primaria);
    expect(luminancia(cores!.primaria)).toBeLessThan(0.05);
    expect(p.b).toBeGreaterThan(p.r);
    // O "JUD" e a balanca sao ouro em degrade: a familia inteira, nao o tom
    // mais escuro dela.
    expect(perto(cores!.secundaria!, "#B98A4E", 45)).toBe(true);
  });

  it("fundo branco nao vira cor da marca", async () => {
    const imagem = await png(
      svg(
        '<rect x="20" y="20" width="160" height="80" fill="#7A1020"/><rect x="200" y="40" width="60" height="40" fill="#E0A100"/>',
        '<rect width="300" height="120" fill="#FFFFFF"/>',
      ),
    );
    const cores = await coresDoLogo(imagem);
    expect(perto(cores!.primaria, "#7A1020")).toBe(true);
    expect(perto(cores!.secundaria!, "#E0A100")).toBe(true);
  });

  it("fundo transparente, SVG direto", async () => {
    const cores = await coresDoLogo(
      svg('<circle cx="60" cy="60" r="50" fill="#123D2B"/><rect x="130" y="30" width="150" height="60" fill="#C8102E"/>'),
    );
    expect(perto(cores!.primaria, "#123D2B")).toBe(true);
    expect(perto(cores!.secundaria!, "#C8102E")).toBe(true);
  });

  it("logo de uma cor so: principal pelo logo, destaque fica como estava", async () => {
    const cores = await coresDoLogo(await png(svg('<rect x="10" y="10" width="280" height="100" fill="#1B3A6B"/>')));
    expect(perto(cores!.primaria, "#1B3A6B")).toBe(true);
    expect(cores!.secundaria).toBeNull();
  });

  it("logo sem cor escura: a mais viva, escurecida ate o texto ler", async () => {
    const cores = await coresDoLogo(await png(svg('<rect x="10" y="10" width="280" height="100" fill="#FFC20E"/>')));
    expect(cores).not.toBeNull();
    // Continua da familia (amarelo vira mostarda), mas le texto branco/escuro.
    const { r, g, b } = paraRgb(cores!.primaria);
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
  });

  it("so fundo claro, ou arquivo que nao e imagem: nao mexe nas cores", async () => {
    expect(await coresDoLogo(await png(svg("", '<rect width="300" height="120" fill="#FAFAFA"/>')))).toBeNull();
    expect(await coresDoLogo(Buffer.from("isto nao e imagem"))).toBeNull();
  });
});
