import { describe, expect, it } from "vitest";
import { CorpoGrandeDemais, formularioLimitado } from "../src/lib/multipart-limitado";

describe("limite do corpo antes do parser multipart", () => {
  it("recusa o corpo grande mesmo sem Content-Length", async () => {
    const req = new Request("https://exemplo.test/api/arquivos", {
      method: "POST", duplex: "half",
      headers: { "content-type": "multipart/form-data; boundary=teste" },
      body: new ReadableStream({ start(controlador) {
        controlador.enqueue(new TextEncoder().encode("x".repeat(1000)));
        controlador.close();
      } }),
    } as RequestInit & { duplex: "half" });
    await expect(formularioLimitado(req, 100)).rejects.toBeInstanceOf(CorpoGrandeDemais);
  });

  it("aceita um corpo dentro do teto", async () => {
    const dados = new FormData();
    dados.set("perfil", "cliente");
    const req = new Request("https://exemplo.test/api/ia/leitura", { method: "POST", body: dados });
    expect((await formularioLimitado(req, 1024)).get("perfil")).toBe("cliente");
  });
});
