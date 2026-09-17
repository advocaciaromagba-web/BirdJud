// Fase 1: senha, segundo fator e a regra que amarra a sessao ao endereco.
import { describe, expect, it } from "vitest";
import { conferirSenha, gerarHash } from "../src/lib/senhas";
import { conferirCodigo, gerarSegredo, urlDeCadastro } from "../src/lib/dois-fatores";
import { motivoParaRecusar } from "../src/lib/sessao";
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
  it("aceita o codigo do momento e recusa um codigo qualquer", async () => {
    const segredo = gerarSegredo();
    const codigo = generateSync({ secret: segredo });
    await expect(conferirCodigo(codigo, segredo)).resolves.toBe(true);
    await expect(conferirCodigo("000000", segredo)).resolves.toBe(false);
    await expect(conferirCodigo("abc", segredo)).resolves.toBe(false);
  });

  it("o QR Code sai com o nome do escritorio, nao com o da plataforma", () => {
    const uri = urlDeCadastro("Escritorio Alfa", "advogado@alfa.adv.br", gerarSegredo());
    expect(uri).toContain(encodeURIComponent("Escritorio Alfa"));
    expect(uri).not.toContain("BirdJud");
  });
});

describe("sessao amarrada ao endereco", () => {
  const alfa = { id: "esc_alfa", status: "ATIVO" };

  it("aceita a sessao do proprio escritorio", () => {
    expect(motivoParaRecusar(alfa, { escritorioId: "esc_alfa" })).toBeNull();
  });

  it("recusa cookie de outro escritorio no subdominio deste", () => {
    expect(motivoParaRecusar(alfa, { escritorioId: "esc_beta" })).toBe(
      "Sessao de outro escritorio."
    );
  });

  it("recusa endereco que nao corresponde a escritorio nenhum", () => {
    expect(motivoParaRecusar(null, { escritorioId: "esc_alfa" })).toBe(
      "Endereco sem escritorio."
    );
  });

  it("recusa escritorio suspenso ou encerrado, mesmo com sessao valida", () => {
    for (const status of ["SUSPENSO", "ENCERRADO"]) {
      expect(motivoParaRecusar({ id: "esc_alfa", status }, { escritorioId: "esc_alfa" })).toBe(
        "Escritorio suspenso ou encerrado."
      );
    }
  });

  it("deixa entrar escritorio inadimplente (cobranca nao e bloqueio imediato)", () => {
    expect(
      motivoParaRecusar({ id: "esc_alfa", status: "INADIMPLENTE" }, { escritorioId: "esc_alfa" })
    ).toBeNull();
  });

  it("recusa quando nao ha sessao", () => {
    expect(motivoParaRecusar(alfa, null)).toBe(
      "Sessao ausente ou invalida para este endereco."
    );
  });
});

describe("subdominio", () => {
  it("extrai o slug do escritorio", () => {
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

  it("nao aceita niveis extras no endereco", () => {
    expect(slugDoHost("alfa.beta.birdjud.com.br")).toBeNull();
  });
});
