import { describe, expect, it } from "vitest";
import { filtrarClientes } from "../src/lib/busca-de-cliente";

const CLIENTES = [
  { id: "1", nome: "João da Silva", documento: "529.982.247-25" },
  { id: "2", nome: "Construtora Aurora Empreendimentos Imobiliários Ltda", documento: "11.222.333/0001-81" },
  { id: "3", nome: "Maria Helena do Prado", documento: null },
];

describe("busca no campo de cliente", () => {
  it("acha sem acento e por parte do nome", () => {
    expect(filtrarClientes(CLIENTES, "joao").map((c) => c.id)).toEqual(["1"]);
    expect(filtrarClientes(CLIENTES, "IMOBILIARIOS").map((c) => c.id)).toEqual(["2"]);
  });

  it("acha por parte do CPF/CNPJ, com ou sem pontuação", () => {
    expect(filtrarClientes(CLIENTES, "529982").map((c) => c.id)).toEqual(["1"]);
    expect(filtrarClientes(CLIENTES, "333/0001").map((c) => c.id)).toEqual(["2"]);
  });

  it("termo vazio devolve a lista, até o limite", () => {
    expect(filtrarClientes(CLIENTES, "")).toHaveLength(3);
    expect(filtrarClientes(CLIENTES, "", 2)).toHaveLength(2);
  });
});
