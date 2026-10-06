// Conciliacao do extrato.
//
// O QUE ESTES TESTES PROTEGEM: dinheiro. Um lancamento classificado errado
// nao aparece como erro — aparece como um resultado do mes que continua
// "plausivel", e e por isso que ninguem procura. E uma sugestao que aponta
// para o cliente errado so se descobre meses depois, quando alguem diz que
// pagou e o sistema diz que nao.
import { describe, expect, it } from "vitest";
import {
  documentoNaDescricao,
  emCentavos,
  mesmoNome,
  normalizarNome,
  regraDoTipo,
  sugerir,
  type CobrancaAberta,
  type EntradaDoExtrato,
} from "../src/lib/conciliacao";
import { diaBR } from "../src/lib/datas";

const COBRANCA = (over: Partial<CobrancaAberta> = {}): CobrancaAberta => ({
  id: "cob1",
  idNoAsaas: "pay_1",
  nomeDoCliente: "JOSE CICERO DOS SANTOS",
  descricao: "Honorarios",
  faltaCentavos: 150_000,
  ...over,
});

const ENTRADA = (over: Partial<EntradaDoExtrato> = {}): EntradaDoExtrato => ({
  id: "tr1",
  tipo: "PIX_RECEIVED",
  valorCentavos: 150_000,
  data: "2026-10-06",
  descricao: "PIX JOSE CICERO DOS SANTOS",
  ...over,
});

describe("o que cada lancamento do extrato significa", () => {
  it("cobranca e Pix recebidos sao receita, automaticos", () => {
    expect(regraDoTipo("PAYMENT_RECEIVED")).toMatchObject({
      destino: "RECEITA",
      automatico: true,
    });
    expect(regraDoTipo("PIX_RECEIVED").destino).toBe("RECEITA");
  });

  it("tarifa e despesa, e vai para a categoria certa", () => {
    const r = regraDoTipo("PAYMENT_FEE");
    expect(r.destino).toBe("DESPESA");
    expect(r.categoria).toBe("TARIFAS");
  });

  // O erro que faz o resultado do mes aparecer perto de zero: o saque para o
  // banco ja foi contado como receita quando o cliente pagou.
  it("saque para a conta do banco NAO e despesa", () => {
    expect(regraDoTipo("TRANSFER").destino).toBe("IGNORAR");
    expect(regraDoTipo("TRANSFER_CANCELLED").destino).toBe("IGNORAR");
  });

  it("conta paga e estorno ao cliente dependem de gente", () => {
    expect(regraDoTipo("BILL_PAYMENT").automatico).toBe(false);
    expect(regraDoTipo("PAYMENT_REFUND").automatico).toBe(false);
  });

  // O provedor acrescenta tipo novo sem avisar. Ignorar automaticamente o que
  // nao se conhece faz o lancamento sumir, e ninguem procura o que nunca
  // apareceu.
  it("tipo desconhecido nunca e automatico", () => {
    const r = regraDoTipo("ALGO_QUE_O_PROVEDOR_INVENTOU");
    expect(r.automatico).toBe(false);
    expect(r.rotulo).toContain("nao reconhecido");
  });
});

describe("o nome de quem pagou", () => {
  it("tira acento, maiusculiza e descarta o PIX da frente", () => {
    expect(normalizarNome("PIX José Cícero  dos Santos")).toBe(
      "JOSE CICERO DOS SANTOS",
    );
    expect(normalizarNome("Pix recebido de Ana Souza")).toBe("ANA SOUZA");
  });

  it("descarta o documento grudado no fim", () => {
    expect(normalizarNome("ANA SOUZA - 529.982.247-25")).toBe("ANA SOUZA");
  });

  // "ANA" esta dentro de "MARIANA" e de "SANTANA". Aceitar isso aponta a
  // sugestao para o cliente errado.
  it("nome curto nao casa por conter", () => {
    expect(mesmoNome("ANA", "MARIANA SOUZA")).toBe(false);
    expect(mesmoNome("ANA", "ANA PAULA LIMA")).toBe(false);
  });

  it("nome com corpo casa, respeitando limite de palavra", () => {
    expect(mesmoNome("JOSE CICERO", "JOSE CICERO DOS SANTOS")).toBe(true);
    expect(mesmoNome("JOSE CICERO DOS SANTOS", "PIX JOSE CICERO DOS SANTOS")).toBe(true);
    expect(mesmoNome("SANTOS DA SILVA", "DOS SANTOS DA SILVA FILHO")).toBe(true);
  });

  it("nao casa pedaco no meio de palavra", () => {
    expect(mesmoNome("MARIANA", "MARIANALVES")).toBe(false);
  });

  it("vazio nao casa com nada", () => {
    expect(mesmoNome("", "ANA SOUZA")).toBe(false);
    expect(mesmoNome("ANA SOUZA", "")).toBe(false);
  });
});

describe("a sugestao", () => {
  it("o id do provedor manda: e certeza, nao palpite", () => {
    const s = sugerir(
      [ENTRADA({ idDaCobranca: "pay_1", descricao: "NOME QUE NAO BATE" })],
      [COBRANCA()],
    );
    expect(s.get("tr1")).toMatchObject({ tipo: "CERTA", cobrancaId: "cob1" });
  });

  it("nome e valor batendo viram sugestao provavel", () => {
    const s = sugerir([ENTRADA()], [COBRANCA()]);
    expect(s.get("tr1")).toMatchObject({ tipo: "PROVAVEL", cobrancaId: "cob1" });
  });

  it("valor diferente nao sugere nada", () => {
    const s = sugerir([ENTRADA({ valorCentavos: 149_900 })], [COBRANCA()]);
    expect(s.get("tr1")).toEqual({ tipo: "NENHUMA" });
  });

  // Duas cobrancas do mesmo valor para nomes parecidos e exatamente quando o
  // palpite erra. Escolher uma em silencio e o pior desfecho.
  it("duas candidatas viram AMBIGUA, e nao escolhemos", () => {
    const s = sugerir(
      [ENTRADA()],
      [COBRANCA(), COBRANCA({ id: "cob2", idNoAsaas: "pay_2" })],
    );
    const r = s.get("tr1")!;
    expect(r.tipo).toBe("AMBIGUA");
    expect(r.tipo === "AMBIGUA" && r.candidatos).toEqual(["cob1", "cob2"]);
  });

  it("so considera o que e receita", () => {
    const s = sugerir(
      [ENTRADA({ tipo: "PAYMENT_FEE" }), ENTRADA({ id: "tr2", tipo: "TRANSFER" })],
      [COBRANCA()],
    );
    expect(s.get("tr1")).toEqual({ tipo: "NENHUMA" });
    expect(s.get("tr2")).toEqual({ tipo: "NENHUMA" });
  });

  it("casa pelo que FALTA, nao pelo valor cheio da cobranca", () => {
    // Cobranca de 1.500 com 500 ja pagos: o Pix de 1.000 e o que resta.
    const s = sugerir(
      [ENTRADA({ valorCentavos: 100_000 })],
      [COBRANCA({ faltaCentavos: 100_000 })],
    );
    expect(s.get("tr1")).toMatchObject({ tipo: "PROVAVEL" });
  });

  it("valor negativo no extrato e lido pelo modulo", () => {
    const s = sugerir([ENTRADA({ valorCentavos: -150_000 })], [COBRANCA()]);
    expect(s.get("tr1")).toMatchObject({ tipo: "PROVAVEL" });
  });
});

describe("dinheiro em centavos", () => {
  // 1.1 * 100 da 110.00000000000001 em ponto flutuante.
  it("converte sem erro de arredondamento", () => {
    expect(emCentavos(1.1)).toBe(110);
    expect(emCentavos(1500)).toBe(150_000);
    expect(emCentavos(0.07)).toBe(7);
    expect(emCentavos(29.99)).toBe(2999);
  });
});

describe("documento na descricao", () => {
  it("acha CPF e CNPJ", () => {
    expect(documentoNaDescricao("ANA SOUZA - 529.982.247-25")).toBe("52998224725");
    expect(documentoNaDescricao("AURORA LTDA 11.222.333/0001-81")).toBe("11222333000181");
  });

  it("numero que nao e documento nao vira documento", () => {
    expect(documentoNaDescricao("PIX ANA SOUZA")).toBeNull();
    expect(documentoNaDescricao("PEDIDO 12345")).toBeNull();
  });
});

describe("dia de calendario na tela", () => {
  // O extrato guarda DIA, nao momento. Formatar em Brasilia voltaria tres
  // horas e mostraria o dia anterior: um Pix do dia 1o viraria dia 30.
  it("mostra o dia que foi gravado, nao o de tres horas antes", () => {
    expect(diaBR(new Date("2026-10-01T00:00:00Z"))).toBe("01/10/2026");
    expect(diaBR(new Date("2026-01-01T00:00:00Z"))).toBe("01/01/2026");
  });
});
