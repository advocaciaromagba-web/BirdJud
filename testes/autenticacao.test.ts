// Fase 1: senha, segundo fator e a regra que amarra a sessao ao endereco.
import { describe, expect, it } from "vitest";
import { conferirSenha, gerarHash } from "../src/lib/senhas";
import {
  conferirCodigo,
  gerarSegredo,
  urlDeCadastro,
} from "../src/lib/dois-fatores";
import { motivoParaRecusar, sessaoRevogada } from "../src/lib/sessao";
import { slugDoHost } from "../src/lib/subdominio";
import { generateSync } from "otplib";

describe("senhas", () => {
  it("confere a senha correta e recusa a errada", async () => {
    const hash = await gerarHash("senha-bem-comprida");
    expect(hash).not.toContain("senha-bem-comprida");
    await expect(conferirSenha("senha-bem-comprida", hash)).resolves.toBe(true);
    await expect(conferirSenha("senha-bem-comprid", hash)).resolves.toBe(false);
  });

  it("recusa senha curta demais", async () => {
    await expect(gerarHash("123456")).rejects.toThrow(/10 caracteres/);
  });
});

describe("segundo fator", () => {
  it("aceita o código do momento e recusa um código qualquer", async () => {
    const segredo = gerarSegredo();
    const codigo = generateSync({ secret: segredo });
    await expect(conferirCodigo(codigo, segredo)).resolves.toBe(true);
    await expect(conferirCodigo("000000", segredo)).resolves.toBe(false);
    await expect(conferirCodigo("abc", segredo)).resolves.toBe(false);
  });

  it("o QR Code sai com o nome do escritório, não com o da plataforma", () => {
    const uri = urlDeCadastro(
      "Escritório Alfa",
      "advogado@alfa.adv.br",
      gerarSegredo(),
    );
    expect(uri).toContain(encodeURIComponent("Escritório Alfa"));
    expect(uri).not.toContain("BirdJud");
  });
});

describe("sessão amarrada ao endereço", () => {
  const alfa = { id: "esc_alfa", status: "ATIVO" };

  it("aceita a sessão do próprio escritório", () => {
    expect(motivoParaRecusar(alfa, { escritorioId: "esc_alfa" })).toBeNull();
  });

  it("recusa cookie de outro escritório no subdomínio deste", () => {
    expect(motivoParaRecusar(alfa, { escritorioId: "esc_beta" })).toBe(
      "Sessão de outro escritório.",
    );
  });

  it("recusa endereço que não corresponde a escritório nenhum", () => {
    expect(motivoParaRecusar(null, { escritorioId: "esc_alfa" })).toBe(
      "Endereço sem escritório.",
    );
  });

  it("recusa escritório suspenso ou encerrado, mesmo com sessão valida", () => {
    for (const status of ["SUSPENSO", "ENCERRADO"]) {
      expect(
        motivoParaRecusar(
          { id: "esc_alfa", status },
          { escritorioId: "esc_alfa" },
        ),
      ).toBe("Escritório suspenso ou encerrado.");
    }
  });

  it("deixa entrar escritório inadimplente (cobrança não e bloqueio imediato)", () => {
    expect(
      motivoParaRecusar(
        { id: "esc_alfa", status: "INADIMPLENTE" },
        { escritorioId: "esc_alfa" },
      ),
    ).toBeNull();
  });

  it("recusa quando não há sessão", () => {
    expect(motivoParaRecusar(alfa, null)).toBe(
      "Sessão ausente ou inválida para este endereço.",
    );
  });
});

describe("revogação de sessão", () => {
  const emissao = new Date("2026-09-18T12:00:00Z").getTime();

  it("sem revogação, a sessão vale", () => {
    expect(sessaoRevogada(emissao, null)).toBe(false);
  });

  it("sessão emitida ANTES da revogação cai", () => {
    expect(sessaoRevogada(emissao, new Date("2026-09-18T12:00:01Z"))).toBe(
      true,
    );
  });

  it("sessão emitida DEPOIS da revogação continua valendo", () => {
    expect(sessaoRevogada(emissao, new Date("2026-09-18T11:59:59Z"))).toBe(
      false,
    );
  });

  it("sessão sem marca de emissão e tratada como antiga", () => {
    // Sessao de antes desta versao do sistema: emitidaEm vem 0.
    expect(sessaoRevogada(0, new Date("2020-01-01T00:00:00Z"))).toBe(true);
  });
});

describe("subdominio", () => {
  it("extrai o slug do escritório", () => {
    expect(slugDoHost("alfa.birdjud.com.br")).toBe("alfa");
    expect(slugDoHost("ALFA.BirdJud.com.br:3000")).toBe("alfa");
  });

  it("ignora subdominios da plataforma e hosts de fora", () => {
    for (const host of [
      "www.birdjud.com.br",
      "app.birdjud.com.br",
      "admin.birdjud.com.br",
      "birdjud.com.br",
      "alfa.outrodominio.com.br",
      null,
    ]) {
      expect(slugDoHost(host)).toBeNull();
    }
  });

  it("não aceita niveis extras no endereço", () => {
    expect(slugDoHost("alfa.beta.birdjud.com.br")).toBeNull();
  });
});
