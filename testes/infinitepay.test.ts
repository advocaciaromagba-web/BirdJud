// InfinitePay.
//
// O QUE ESTES TESTES PROTEGEM: dinheiro lido errado de um arquivo de texto. O
// CSV nao avisa quando foi mal interpretado — a linha entra com o valor de
// outra coluna, ou com o sinal trocado, e o extrato do escritorio fica
// "plausivel" e errado.
import { describe, expect, it } from "vitest";
import {
  COLUNAS,
  chaveDaLinha,
  lerCsvDaInfinitePay,
  separarCampos,
  tipoDaLinha,
  valorEmCentavos,
} from "../src/lib/infinitepay-extrato";
import { limparHandle, telefoneParaInfinitePay } from "../src/lib/infinitepay";
import { regraDoTipo } from "../src/lib/conciliacao";

const CABECALHO = COLUNAS.join(",");

describe("separar os campos", () => {
  it("campo simples", () => {
    expect(separarCampos("a,b,c")).toEqual(["a", "b", "c"]);
  });

  // "SILVA, JOAO" e comum. Um split ingenuo partiria a linha no meio e
  // jogaria o valor para a coluna errada.
  it("virgula dentro de aspas nao separa", () => {
    expect(separarCampos('2026-10-01,"SILVA, JOAO","+R$ 10,00"')).toEqual([
      "2026-10-01",
      "SILVA, JOAO",
      "+R$ 10,00",
    ]);
  });

  it("aspas dobradas viram uma aspa", () => {
    expect(separarCampos('a,"diz ""oi""",b')).toEqual(["a", 'diz "oi"', "b"]);
  });

  it("ponto e virgula tambem separa", () => {
    expect(separarCampos("a;b;c")).toEqual(["a", "b", "c"]);
  });
});

describe("valor em centavos", () => {
  it("le o formato do extrato", () => {
    expect(valorEmCentavos("+R$ 1.234,56")).toBe(123456);
    expect(valorEmCentavos("-R$ 500,00")).toBe(-50000);
    expect(valorEmCentavos("R$ 10")).toBe(1000);
    expect(valorEmCentavos("0,07")).toBe(7);
  });

  // 1.1 * 100 da 110.00000000000001 em ponto flutuante. Dinheiro nao passa
  // por ponto flutuante nem na leitura.
  it("nao arredonda errado", () => {
    expect(valorEmCentavos("1,10")).toBe(110);
    expect(valorEmCentavos("29,99")).toBe(2999);
    expect(valorEmCentavos("1.000.000,01")).toBe(100000001);
  });

  it("o que nao e valor nao vira zero", () => {
    expect(valorEmCentavos("")).toBeNull();
    expect(valorEmCentavos("—")).toBeNull();
    expect(valorEmCentavos("pendente")).toBeNull();
  });
});

describe("tipo da linha", () => {
  it("reconhece o que o extrato traz", () => {
    expect(tipoDaLinha("Pix", "Recebido")).toBe("PIX_RECEBIDO");
    expect(tipoDaLinha("Pix", "Enviado")).toBe("PIX_ENVIADO");
    expect(tipoDaLinha("Boleto", "Pago")).toBe("BOLETO_PAGO");
    expect(tipoDaLinha("Depósito", "Vendas")).toBe("DEPOSITO_VENDAS");
    expect(tipoDaLinha("Deposito", "Vendas")).toBe("DEPOSITO_VENDAS");
  });

  // Tipo novo nao pode virar automatico: o provedor acrescenta sem avisar.
  it("tipo desconhecido sobe com o nome que veio, e nao e automatico", () => {
    const tipo = tipoDaLinha("Coisa Nova", "Sei la");
    expect(tipo).toBe("COISA_NOVA_SEI_LA");
    expect(regraDoTipo(tipo).automatico).toBe(false);
  });

  // Pelo extrato nao da para saber se e despesa do escritorio, repasse entre
  // socios ou dinheiro de cliente indo para onde devia.
  it("dinheiro saindo nunca e automatico", () => {
    expect(regraDoTipo("PIX_ENVIADO").automatico).toBe(false);
    expect(regraDoTipo("BOLETO_PAGO").automatico).toBe(false);
  });

  it("dinheiro entrando e automatico", () => {
    expect(regraDoTipo("PIX_RECEBIDO")).toMatchObject({ destino: "RECEITA", automatico: true });
    expect(regraDoTipo("DEPOSITO_VENDAS")).toMatchObject({ destino: "RECEITA", automatico: true });
  });
});

describe("chave da linha", () => {
  // O CSV nao traz id de transacao. Reimportar o mesmo periodo nao pode
  // duplicar o extrato inteiro.
  it("a mesma linha da a mesma chave", () => {
    const a = chaveDaLinha("2026-10-01", "10:30", "ANA", "Recebido", 15000);
    const b = chaveDaLinha("2026-10-01", "10:30", "ANA", "Recebido", 15000);
    expect(a).toBe(b);
  });

  it("qualquer campo diferente muda a chave", () => {
    const base = chaveDaLinha("2026-10-01", "10:30", "ANA", "Recebido", 15000);
    expect(chaveDaLinha("2026-10-02", "10:30", "ANA", "Recebido", 15000)).not.toBe(base);
    expect(chaveDaLinha("2026-10-01", "10:31", "ANA", "Recebido", 15000)).not.toBe(base);
    expect(chaveDaLinha("2026-10-01", "10:30", "BIA", "Recebido", 15000)).not.toBe(base);
    expect(chaveDaLinha("2026-10-01", "10:30", "ANA", "Enviado", 15000)).not.toBe(base);
    expect(chaveDaLinha("2026-10-01", "10:30", "ANA", "Recebido", 15001)).not.toBe(base);
  });
});

describe("ler o CSV", () => {
  it("le o extrato de verdade", () => {
    const csv = [
      CABECALHO,
      '2026-10-01,10:30:00,Pix,ANA SOUZA,Recebido,"+R$ 1.500,00"',
      '2026-10-02,14:05:00,Pix,"SILVA, JOAO",Enviado,"-R$ 200,00"',
      '2026-10-03,09:00:00,Depósito,,Vendas,"+R$ 980,45"',
    ].join("\n");
    const r = lerCsvDaInfinitePay(csv);
    expect(r.erro).toBeNull();
    expect(r.lidas).toBe(3);
    expect(r.linhas).toHaveLength(3);
    expect(r.linhas[0]).toMatchObject({
      tipo: "PIX_RECEBIDO",
      valorCentavos: 150000,
      data: "2026-10-01",
      descricao: "ANA SOUZA",
    });
    expect(r.linhas[1]).toMatchObject({ tipo: "PIX_ENVIADO", valorCentavos: -20000 });
    expect(r.linhas[2]).toMatchObject({ tipo: "DEPOSITO_VENDAS", valorCentavos: 98045 });
  });

  it("aceita data em pt-BR", () => {
    const csv = `${CABECALHO}\n01/10/2026,10:30,Pix,ANA,Recebido,"+R$ 10,00"`;
    expect(lerCsvDaInfinitePay(csv).linhas[0].data).toBe("2026-10-01");
  });

  it("aceita CRLF e linha em branco no fim", () => {
    const csv = `${CABECALHO}\r\n2026-10-01,10:30,Pix,ANA,Recebido,"+R$ 10,00"\r\n\r\n`;
    expect(lerCsvDaInfinitePay(csv).linhas).toHaveLength(1);
  });

  // BOM faz a primeira coluna virar "﻿Data" e nenhuma casar. O arquivo
  // pareceria "de outro sistema" sem ser.
  it("aceita arquivo com BOM", () => {
    const csv = `﻿${CABECALHO}\n2026-10-01,10:30,Pix,ANA,Recebido,"+R$ 10,00"`;
    const r = lerCsvDaInfinitePay(csv);
    expect(r.erro).toBeNull();
    expect(r.linhas).toHaveLength(1);
  });

  it("arquivo de outro sistema diz o que falta", () => {
    const r = lerCsvDaInfinitePay("Data,Valor\n2026-10-01,10");
    expect(r.erro).toContain("Tipo de transação");
    expect(r.linhas).toEqual([]);
  });

  it("arquivo vazio nao e extrato", () => {
    expect(lerCsvDaInfinitePay("").erro).toContain("vazio");
    expect(lerCsvDaInfinitePay("   \n  ").erro).toContain("vazio");
  });

  // Metade de um lancamento no financeiro e pior que lancamento nenhum.
  it("linha que nao deu para entender e recusada, nao chutada", () => {
    const csv = [
      CABECALHO,
      '2026-10-01,10:30,Pix,ANA,Recebido,"+R$ 10,00"',
      '"sem data",10:30,Pix,BIA,Recebido,"+R$ 10,00"',
      "2026-10-03,10:30,Pix,CARLOS,Recebido,pendente",
    ].join("\n");
    const r = lerCsvDaInfinitePay(csv);
    expect(r.linhas).toHaveLength(1);
    expect(r.recusadas).toEqual([
      { linha: 3, motivo: "nao entendi a data" },
      { linha: 4, motivo: "nao entendi o valor" },
    ]);
  });
});

describe("handle", () => {
  // Gente cola "$joao", "@joao" e a URL inteira do perfil.
  it("aceita do jeito que a informacao chega", () => {
    expect(limparHandle("joaosilva")).toBe("joaosilva");
    expect(limparHandle("$joaosilva")).toBe("joaosilva");
    expect(limparHandle("@joaosilva")).toBe("joaosilva");
    expect(limparHandle("  JoaoSilva  ")).toBe("joaosilva");
    expect(limparHandle("https://pag.ae/joaosilva")).toBe("joaosilva");
    expect(limparHandle("infinitepay.io/joao.silva_1")).toBe("joao.silva_1");
  });

  it("recusa o que nao e handle", () => {
    expect(limparHandle("")).toBeNull();
    expect(limparHandle("a")).toBeNull();
    expect(limparHandle("joao silva")).toBeNull();
    expect(limparHandle("joão")).toBeNull();
  });
});

describe("telefone", () => {
  it("vai no formato que eles pedem", () => {
    expect(telefoneParaInfinitePay("(11) 99999-8888")).toBe("+5511999998888");
    expect(telefoneParaInfinitePay("5511999998888")).toBe("+5511999998888");
    expect(telefoneParaInfinitePay("1133334444")).toBe("+551133334444");
  });

  it("telefone curto demais nao vai", () => {
    expect(telefoneParaInfinitePay(null)).toBeUndefined();
    expect(telefoneParaInfinitePay("999")).toBeUndefined();
  });
});
