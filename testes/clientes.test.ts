// Pendencias do cadastro de cliente.
//
// O QUE ESTES TESTES PROTEGEM: a regra de que so vira pendencia o que custa
// alguma coisa NESTE escritorio. Pendencia que nao custa nada e ruido, e ruido
// ensina a ignorar a lista inteira — e aí a pendencia que importa passa junto.
import { describe, expect, it } from "vitest";
import { pendenciasDoCliente, quantasImpedem } from "../src/lib/clientes";
import type { Modulo } from "../src/lib/catalogo";

const NUCLEO: Modulo[] = ["NUCLEO"];
const COM_COBRANCA: Modulo[] = ["NUCLEO", "COBRANCAS"];
const COM_TUDO: Modulo[] = ["NUCLEO", "COBRANCAS", "EMAIL", "WHATSAPP"];
const COMPLETO = {
  documento: "11.222.333/0001-81",
  email: "contato@exemplo.com.br",
  telefone: "71 99999-0000",
};
const UM_ARQUIVO = { arquivos: 1 };

function tipos(lista: ReturnType<typeof pendenciasDoCliente>) {
  return lista.map((p) => p.tipo);
}

describe("cliente completo", () => {
  it("nao acusa nada", () => {
    expect(pendenciasDoCliente(COMPLETO, COM_TUDO, UM_ARQUIVO)).toEqual([]);
  });
});

describe("a falta so pesa onde custa", () => {
  it("sem CPF e sem cobranca contratada: apenas aviso", () => {
    const p = pendenciasDoCliente({ ...COMPLETO, documento: null }, NUCLEO, UM_ARQUIVO);
    expect(tipos(p)).toEqual(["SEM_DOCUMENTO"]);
    expect(p[0]!.gravidade).toBe("AVISO");
  });

  it("sem CPF e COM cobranca: impede, e diz o que impede", () => {
    const p = pendenciasDoCliente({ ...COMPLETO, documento: "" }, COM_COBRANCA, UM_ARQUIVO);
    expect(p[0]!.gravidade).toBe("IMPEDE");
    expect(p[0]!.texto).toContain("nao da para emitir cobranca");
  });

  it("sem telefone so vira limitacao com WhatsApp contratado", () => {
    const sem = { ...COMPLETO, telefone: null };
    expect(pendenciasDoCliente(sem, NUCLEO, UM_ARQUIVO)[0]!.gravidade).toBe("AVISO");
    expect(pendenciasDoCliente(sem, COM_TUDO, UM_ARQUIVO)[0]!.gravidade).toBe("LIMITA");
  });

  it("sem e-mail com cobranca: o link de pagamento nao chega", () => {
    const p = pendenciasDoCliente({ ...COMPLETO, email: null }, COM_COBRANCA, UM_ARQUIVO);
    expect(p[0]!.texto).toContain("link de pagamento");
  });
});

describe("documento preenchido errado", () => {
  // Pior que faltar: parece preenchido. A recusa viria do provedor, com uma
  // mensagem que ninguem liga a este cadastro.
  it("digito verificador que nao fecha e acusado", () => {
    const p = pendenciasDoCliente(
      { ...COMPLETO, documento: "111.222.333-44" },
      COM_COBRANCA,
      UM_ARQUIVO,
    );
    expect(tipos(p)).toEqual(["DOCUMENTO_INVALIDO"]);
    expect(p[0]!.gravidade).toBe("IMPEDE");
  });

  it("CPF valido passa", () => {
    expect(
      pendenciasDoCliente({ ...COMPLETO, documento: "529.982.247-25" }, COM_TUDO, UM_ARQUIVO),
    ).toEqual([]);
  });

  it("nao acusa falta E invalidez ao mesmo tempo", () => {
    const p = pendenciasDoCliente({ ...COMPLETO, documento: "   " }, COM_TUDO, UM_ARQUIVO);
    expect(tipos(p)).toEqual(["SEM_DOCUMENTO"]);
  });
});

describe("documentos anexados", () => {
  it("sem nenhum arquivo, avisa que nao ha o que conferir", () => {
    const p = pendenciasDoCliente(COMPLETO, COM_TUDO, { arquivos: 0 });
    expect(tipos(p)).toEqual(["SEM_ARQUIVO"]);
    expect(p[0]!.gravidade).toBe("AVISO");
  });
});

describe("ordem e contagem", () => {
  it("o que impede vem primeiro", () => {
    const p = pendenciasDoCliente(
      { documento: null, email: null, telefone: null },
      COM_TUDO,
      { arquivos: 0 },
    );
    expect(p[0]!.gravidade).toBe("IMPEDE");
    expect(p.map((x) => x.gravidade)).toEqual(["IMPEDE", "LIMITA", "LIMITA", "AVISO"]);
    expect(quantasImpedem(p)).toBe(1);
  });

  it("escritorio sem modulo nenhum nao ganha nada que impeca", () => {
    const p = pendenciasDoCliente({ documento: null, email: null, telefone: null }, NUCLEO, {
      arquivos: 0,
    });
    expect(quantasImpedem(p)).toBe(0);
  });
});

describe("documento essencial que a lista pediu", () => {
  const COMPLETO2 = {
    documento: "11.222.333/0001-81",
    email: "contato@exemplo.com.br",
    telefone: "71 99999-0000",
  };

  it("nao acusa quando nao ha lista", () => {
    const p = pendenciasDoCliente(COMPLETO2, ["NUCLEO"], { arquivos: 1 });
    expect(p).toEqual([]);
  });

  it("acusa o que falta, pelo numero", () => {
    const p = pendenciasDoCliente(COMPLETO2, ["NUCLEO"], {
      arquivos: 1,
      essenciaisPendentes: 3,
    });
    expect(p).toHaveLength(1);
    expect(p[0]!.tipo).toBe("DOCUMENTO_ESSENCIAL_PENDENTE");
    expect(p[0]!.texto).toContain("3 documentos essenciais");
  });

  it("fala no singular quando e um so", () => {
    const p = pendenciasDoCliente(COMPLETO2, ["NUCLEO"], {
      arquivos: 1,
      essenciaisPendentes: 1,
    });
    expect(p[0]!.texto).toContain("1 documento essencial");
  });

  // Saber O QUE falta vale mais que saber que falta alguma coisa.
  it("vem antes do aviso generico de nenhum arquivo", () => {
    const p = pendenciasDoCliente(COMPLETO2, ["NUCLEO"], {
      arquivos: 0,
      essenciaisPendentes: 2,
    });
    expect(p.map((x) => x.tipo)).toEqual([
      "DOCUMENTO_ESSENCIAL_PENDENTE",
      "SEM_ARQUIVO",
    ]);
  });
});
