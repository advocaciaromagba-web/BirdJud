// Modelo de documento do escritorio.
//
// O QUE ESTES TESTES PROTEGEM: a peca que vai para o cliente assinar. O erro
// que importa aqui nao da erro: a procuracao sai com o nome em branco, ou com
// o valor dos honorarios faltando, e ninguem percebe ate alguem ler.
import { describe, expect, it } from "vitest";
import {
  CAMPOS,
  CHAVES_CONHECIDAS,
  SEM_VALOR,
  camposDoModelo,
  preencher,
  textoDoDocumento,
} from "../src/lib/modelos";

/** Um paragrafo de .docx, com o texto repartido como o Word reparte. */
function paragrafo(...pedacos: string[]): string {
  return `<w:p>${pedacos.map((t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`).join("")}</w:p>`;
}
const doc = (...ps: string[]) =>
  `<?xml version="1.0"?><w:document><w:body>${ps.join("")}</w:body></w:document>`;

const VALORES = {
  "cliente.nome": "Jose Cicero dos Santos",
  "escritorio.nome": "Escritorio Modelo",
  "honorarios.valor": "R$ 3.000,00",
};

describe("campo inteiro em um pedaco so", () => {
  it("troca pelo valor", () => {
    const r = preencher(doc(paragrafo("Outorgante: {{cliente.nome}}.")), VALORES);
    expect(textoDoDocumento(r.xml)).toBe("Outorgante: Jose Cicero dos Santos.");
  });
});

describe("campo repartido pelo Word", () => {
  // ESTE e o teste que justifica o arquivo inteiro. O Word parte a palavra em
  // varios <w:r> sem avisar — basta alguem ter passado o corretor. Uma troca
  // ingenua nao acha nada e sai calada, com a peca errada.
  it("acha o campo quebrado no meio", () => {
    const r = preencher(
      doc(paragrafo("Outorgante: {{cli", "ente.", "nome}}", ".")),
      VALORES,
    );
    expect(textoDoDocumento(r.xml)).toBe("Outorgante: Jose Cicero dos Santos.");
  });

  it("acha mesmo com as chaves separadas", () => {
    const r = preencher(doc(paragrafo("{", "{cliente.nome", "}", "}")), VALORES);
    expect(textoDoDocumento(r.xml)).toBe("Jose Cicero dos Santos");
  });

  it("conferir o modelo tambem enxerga o campo quebrado", () => {
    const { usados } = camposDoModelo(doc(paragrafo("{{cli", "ente.nome}}")));
    expect(usados).toEqual(["cliente.nome"]);
  });
});

describe("dois campos no mesmo paragrafo", () => {
  it("troca os dois", () => {
    const r = preencher(
      doc(paragrafo("{{escritorio.nome}} cobra {{honorarios.valor}}.")),
      VALORES,
    );
    expect(textoDoDocumento(r.xml)).toBe("Escritorio Modelo cobra R$ 3.000,00.");
  });
});

describe("campo sem valor", () => {
  // Em branco seria o pior resultado: a peca sai com um buraco no lugar do
  // valor e ninguem ve. Marcado, salta aos olhos de quem conferir.
  it("fica visivel, nao em branco", () => {
    const r = preencher(doc(paragrafo("Valor: {{honorarios.valor}}.")), {});
    expect(textoDoDocumento(r.xml)).toBe(`Valor: ${SEM_VALOR}.`);
    expect(r.semValor).toEqual(["honorarios.valor"]);
  });

  it("valor so de espaco conta como sem valor", () => {
    const r = preencher(doc(paragrafo("{{cliente.nome}}")), { "cliente.nome": "   " });
    expect(r.semValor).toEqual(["cliente.nome"]);
  });
});

describe("campo que o sistema nao conhece", () => {
  // Campo digitado errado tem de aparecer na peca, nao sumir: sumindo, o
  // escritorio nunca descobre que escreveu {{cliente.nomee}}.
  it("fica escrito como esta, e e denunciado", () => {
    const r = preencher(doc(paragrafo("Ola {{cliente.nomee}}.")), VALORES);
    expect(textoDoDocumento(r.xml)).toBe("Ola {{cliente.nomee}}.");
    expect(r.desconhecidos).toEqual(["cliente.nomee"]);
    expect(camposDoModelo(doc(paragrafo("{{cliente.nomee}}"))).desconhecidos).toEqual([
      "cliente.nomee",
    ]);
  });
});

describe("paragrafos diferentes", () => {
  // Um "{{" perdido no fim de um paragrafo nao pode casar com um "}}" de
  // outro e comer tudo que estiver entre os dois.
  it("nao atravessam", () => {
    const r = preencher(
      doc(paragrafo("abre {{cliente"), paragrafo("texto do meio"), paragrafo(".nome}} fecha")),
      VALORES,
    );
    const texto = textoDoDocumento(r.xml);
    expect(texto).toContain("texto do meio");
    expect(texto).not.toContain("Jose Cicero");
  });
});

describe("XML nao quebra", () => {
  it("escapa o que o valor traz", () => {
    const r = preencher(doc(paragrafo("{{cliente.nome}}")), {
      "cliente.nome": 'Ana & Cia <"Silva">',
    });
    expect(r.xml).toContain("Ana &amp; Cia &lt;");
    expect(textoDoDocumento(r.xml)).toBe('Ana & Cia <"Silva">');
  });

  it("le valor que ja vinha escapado no modelo", () => {
    const xml = doc(`<w:p><w:r><w:t>M&amp;A: {{cliente.nome}}</w:t></w:r></w:p>`);
    expect(textoDoDocumento(preencher(xml, VALORES).xml)).toBe(
      "M&A: Jose Cicero dos Santos",
    );
  });
});

describe("modelo sem campo nenhum", () => {
  it("sai igual ao que entrou", () => {
    const xml = doc(paragrafo("Texto fixo, sem campo."));
    const r = preencher(xml, VALORES);
    expect(r.xml).toBe(xml);
    expect(r.semValor).toEqual([]);
  });
});

describe("catalogo de campos", () => {
  it("nao tem chave repetida e toda chave e conhecida", () => {
    expect(new Set(CAMPOS.map((c) => c.chave)).size).toBe(CAMPOS.length);
    for (const c of CAMPOS) expect(CHAVES_CONHECIDAS.has(c.chave)).toBe(true);
  });

  it("toda chave e minuscula e sem espaco", () => {
    for (const c of CAMPOS) expect(c.chave).toMatch(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/);
  });
});

describe("cabecalho e rodape", () => {
  // O timbre mora no cabecalho. Preencher so o corpo deixaria {{...}} impresso
  // no alto de toda folha que o escritorio mandar para o cliente.
  it("sao tratados como o corpo", () => {
    const cabecalho = doc(paragrafo("{{escritorio.nome}} — {{escritorio.cidade}}"));
    const r = preencher(cabecalho, {
      "escritorio.nome": "Advocacia Modelo",
      "escritorio.cidade": "Sao Paulo",
    });
    expect(textoDoDocumento(r.xml)).toBe("Advocacia Modelo — Sao Paulo");
  });
});
