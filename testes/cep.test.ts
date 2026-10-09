// CEP: leitura de cada servico, ordem de tentativa e memoria.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buscarCep, cepComHifen, digitosDoCep, esquecerCeps, LER } from "../src/lib/cep";
import { DadoInvalido, enderecoLimpo } from "../src/lib/dados-do-escritorio";

describe("digitos e mascara", () => {
  it("aceita CEP com ou sem hifen e recusa tamanho errado", () => {
    expect(digitosDoCep("01310-100")).toBe("01310100");
    expect(digitosDoCep(" 14840000 ")).toBe("14840000");
    expect(digitosDoCep("1310-100")).toBeNull();
    expect(digitosDoCep("")).toBeNull();
    expect(digitosDoCep(undefined)).toBeNull();
    expect(cepComHifen("01310100")).toBe("01310-100");
  });
});

describe("leitura das respostas", () => {
  it("ViaCEP com rua", () => {
    expect(
      LER.VIACEP("01310100", { logradouro: "Avenida Paulista", bairro: "Bela Vista", localidade: "São Paulo", uf: "SP" }),
    ).toEqual({ cep: "01310100", logradouro: "Avenida Paulista", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP", geral: false, fonte: "VIACEP" });
  });

  it("ViaCEP com erro (verdadeiro ou texto) vira nada", () => {
    expect(LER.VIACEP("14840000", { erro: true })).toBeNull();
    expect(LER.VIACEP("14840000", { erro: "true" })).toBeNull();
  });

  it("BrasilAPI de CEP geral: sem rua, marcado como geral", () => {
    const r = LER.BRASILAPI("14840000", { cep: "14840000", state: "SP", city: "Guariba", neighborhood: null, street: null });
    expect(r).toMatchObject({ cidade: "Guariba", uf: "SP", logradouro: null, bairro: null, geral: true, fonte: "BRASILAPI" });
  });

  it("OpenCEP e UF minuscula; sem cidade ou UF invalida nao serve", () => {
    expect(LER.OPENCEP("01310100", { logradouro: "Avenida Paulista", bairro: "Bela Vista", localidade: "São Paulo", uf: "sp" })?.uf).toBe("SP");
    expect(LER.OPENCEP("01310100", { logradouro: "x", localidade: "", uf: "SP" })).toBeNull();
    expect(LER.OPENCEP("01310100", { localidade: "X", uf: "SPA" })).toBeNull();
  });
});

describe("busca em sequencia", () => {
  let servidor: Server;
  let base = "";
  const pedidos: string[] = [];
  // Resposta de cada servico por CEP: [status, corpo]. Sem entrada: 404.
  const respostas: Record<string, Record<string, [number, unknown]>> = { viacep: {}, brasil: {}, open: {} };

  beforeAll(async () => {
    servidor = createServer((req, res) => {
      const [, servico, cep] = (req.url ?? "").split("/");
      pedidos.push(`${servico}/${cep}`);
      const [status, corpo] = respostas[servico]?.[cep] ?? [404, { erro: "nao achou" }];
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(corpo));
    });
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    process.env.CEP_VIACEP_URL = `${base}/viacep`;
    process.env.CEP_BRASILAPI_URL = `${base}/brasil`;
    process.env.CEP_OPENCEP_URL = `${base}/open`;
  });

  afterAll(async () => {
    delete process.env.CEP_VIACEP_URL;
    delete process.env.CEP_BRASILAPI_URL;
    delete process.env.CEP_OPENCEP_URL;
    await new Promise((ok) => servidor.close(ok));
  });

  beforeEach(() => {
    esquecerCeps();
    pedidos.length = 0;
    for (const s of Object.values(respostas)) for (const k of Object.keys(s)) delete s[k];
  });

  it("ViaCEP achou com rua: nao pergunta aos outros", async () => {
    respostas.viacep["01310100"] = [200, { logradouro: "Avenida Paulista", bairro: "Bela Vista", localidade: "São Paulo", uf: "SP" }];
    const r = await buscarCep("01310-100");
    expect(r).toMatchObject({ logradouro: "Avenida Paulista", fonte: "VIACEP", geral: false });
    expect(pedidos).toEqual(["viacep/01310100"]);
  });

  it("CEP geral que o ViaCEP nao conhece: a BrasilAPI responde", async () => {
    respostas.viacep["14840000"] = [200, { erro: "true" }];
    respostas.brasil["14840000"] = [200, { city: "Guariba", state: "SP", street: null, neighborhood: null }];
    const r = await buscarCep("14840000");
    expect(r).toMatchObject({ cidade: "Guariba", uf: "SP", geral: true, fonte: "BRASILAPI" });
    // Geral: ainda tenta o terceiro, que poderia trazer rua; nao trouxe, fica o geral.
    expect(pedidos).toEqual(["viacep/14840000", "brasil/14840000", "open/14840000"]);
  });

  it("servico fora do ar (500): passa para o proximo", async () => {
    respostas.viacep["01310100"] = [500, {}];
    respostas.brasil["01310100"] = [500, {}];
    respostas.open["01310100"] = [200, { logradouro: "Avenida Paulista", bairro: "Bela Vista", localidade: "São Paulo", uf: "SP" }];
    expect((await buscarCep("01310100"))?.fonte).toBe("OPENCEP");
  });

  it("CEP que ninguem conhece: nada, e a resposta fica guardada", async () => {
    expect(await buscarCep("99999999")).toBeNull();
    expect(pedidos).toHaveLength(3);
    expect(await buscarCep("99999-999")).toBeNull();
    expect(pedidos).toHaveLength(3);
  });

  it("achado fica na memoria: a segunda consulta nao sai do servidor", async () => {
    respostas.viacep["01310100"] = [200, { logradouro: "Avenida Paulista", bairro: "Bela Vista", localidade: "São Paulo", uf: "SP" }];
    await buscarCep("01310100");
    await buscarCep("01310100");
    expect(pedidos).toEqual(["viacep/01310100"]);
  });

  it("todos fora do ar: nao guarda 'nao existe' e tenta de novo depois", async () => {
    for (const s of ["viacep", "brasil", "open"]) respostas[s]["01310100"] = [503, {}];
    expect(await buscarCep("01310100")).toBeNull();
    respostas.viacep["01310100"] = [200, { logradouro: "Avenida Paulista", bairro: "Bela Vista", localidade: "São Paulo", uf: "SP" }];
    expect((await buscarCep("01310100"))?.logradouro).toBe("Avenida Paulista");
  });

  it("entrada invalida nem consulta", async () => {
    expect(await buscarCep("123")).toBeNull();
    expect(pedidos).toHaveLength(0);
  });
});

describe("endereco gravado", () => {
  it("CEP so digitos, UF maiuscula e a rua com os dois nomes", () => {
    expect(
      enderecoLimpo({ cep: "01310-100", logradouro: " Avenida Paulista ", numero: "1000", bairro: "Bela Vista", cidade: "São Paulo", uf: "sp", complemento: "" }),
    ).toEqual({ cep: "01310100", logradouro: "Avenida Paulista", rua: "Avenida Paulista", numero: "1000", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP" });
  });

  it("aceita a rua com o nome antigo e devolve nada quando tudo vazio", () => {
    expect(enderecoLimpo({ rua: "Rua A" })).toEqual({ logradouro: "Rua A", rua: "Rua A" });
    expect(enderecoLimpo({ cep: "", uf: " " })).toBeNull();
  });

  it("recusa CEP incompleto e UF invalida", () => {
    expect(() => enderecoLimpo({ cep: "1484" })).toThrow(DadoInvalido);
    expect(() => enderecoLimpo({ uf: "Sao Paulo" })).toThrow(DadoInvalido);
  });
});
