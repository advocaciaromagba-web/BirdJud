// Arquivo enviado por formulario.
//
// O que se prova: o reconhecimento nao depende do `File` global — que so
// existe do Node 20 em diante e derrubou a rota de leitura por IA em
// producao, com "ReferenceError: File is not defined", enquanto passava no
// computador de desenvolvimento.
import { describe, expect, it } from "vitest";
import { arquivosDoCampo, ehArquivoEnviado } from "../src/lib/formulario";

function arquivoFalso(nome: string, tamanho = 10) {
  return {
    name: nome,
    size: tamanho,
    type: "application/pdf",
    arrayBuffer: async () => new ArrayBuffer(tamanho),
  };
}

describe("arquivo enviado", () => {
  it("reconhece pelo formato, nao pela classe global", () => {
    // Objeto que nao e File nenhum, e ainda assim e um arquivo enviado.
    expect(ehArquivoEnviado(arquivoFalso("contrato.pdf"))).toBe(true);
  });

  it("nao confunde texto do formulario com arquivo", () => {
    expect(ehArquivoEnviado("CLIENTE")).toBe(false);
    expect(ehArquivoEnviado(null)).toBe(false);
    expect(ehArquivoEnviado(undefined)).toBe(false);
    expect(ehArquivoEnviado({ name: "sem-bytes.pdf", size: 3 })).toBe(false);
  });

  it("separa os arquivos do campo e ignora o resto", () => {
    const formulario = new FormData();
    formulario.append("perfil", "CLIENTE");
    formulario.append("arquivos", new Blob(["a"]), "rg.png");
    formulario.append("arquivos", new Blob(["bb"]), "cnpj.pdf");
    formulario.append("outro", new Blob(["c"]), "nao-e-deste-campo.pdf");

    const achados = arquivosDoCampo(formulario, "arquivos");
    expect(achados.map((a) => a.name)).toEqual(["rg.png", "cnpj.pdf"]);
  });

  it("campo sem arquivo devolve lista vazia, nao erro", () => {
    const formulario = new FormData();
    formulario.append("perfil", "PROCESSO");
    expect(arquivosDoCampo(formulario, "arquivos")).toEqual([]);
  });
});
