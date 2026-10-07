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
import { MODELO_PADRAO } from "../src/lib/modelos-padrao";
import {
  advogadosDaPeca,
  cidadeEData,
  qualificacaoDoAdvogado,
  qualificacaoDoEscritorio,
} from "../src/lib/qualificacao";

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

describe("qualificacao na peca", () => {
  // "Ana Paula Martins, brasileira, casada, advogado, inscrito na OAB" e um
  // erro que salta aos olhos de quem assina.
  it("concorda com o genero que a propria pessoa cadastrou", () => {
    const dela = qualificacaoDoAdvogado({
      nome: "Ana", oab: "SP 1", cpf: "52998224725", nacionalidade: "brasileira", estadoCivil: "casada",
    });
    expect(dela).toContain("advogada, inscrita");
    expect(dela).toContain("portadora do CPF");

    const dele = qualificacaoDoAdvogado({
      nome: "Bruno", oab: "SP 2", cpf: "11144477735", nacionalidade: "brasileiro", estadoCivil: "solteiro",
    });
    expect(dele).toContain("advogado, inscrito");
    expect(dele).toContain("portador do CPF");
  });

  // Nome nao diz genero, e errar o genero de alguem em um documento que ela
  // assina e pior do que o masculino por falta de dado.
  it("sem dado nenhum fica no masculino, que e a forma do cargo em lei", () => {
    expect(qualificacaoDoAdvogado({ nome: "Alguem", oab: "SP 3" })).toContain("advogado, inscrito");
  });

  it("o que nao foi preenchido nao aparece", () => {
    const q = qualificacaoDoAdvogado({ nome: "Alguem", oab: "SP 3" });
    expect(q).not.toContain("RG");
    expect(q).not.toContain("CPF");
  });

  it("sociedade unipessoal vem antes, e ele representa ela", () => {
    const q = qualificacaoDoAdvogado({
      nome: "Ana", oab: "SP 1", nacionalidade: "brasileira",
      sociedade: "Ana Sociedade Unipessoal de Advocacia", sociedadeCnpj: "11444777000161",
    });
    expect(q.startsWith("Ana Sociedade Unipessoal de Advocacia")).toBe(true);
    expect(q).toContain("11.444.777/0001-61");
    expect(q).toContain("representada por Ana");
  });

  it("o escritorio sai com CNPJ, registro na OAB e sede", () => {
    const q = qualificacaoDoEscritorio({
      nome: "Marca", razaoSocial: "Alfa Sociedade Unipessoal de Advocacia",
      cnpj: "11222333000181", registroOab: "99999",
      enderecos: [{ logradouro: "Rua A", numero: "10", cidade: "Ribeirao Preto", uf: "SP" }],
    });
    expect(q.startsWith("Alfa Sociedade Unipessoal de Advocacia")).toBe(true);
    expect(q).toContain("11.222.333/0001-81");
    expect(q).toContain("Registro de Sociedade de Advocacia nº 99999");
    expect(q).toContain("com sede a Rua A, nº 10");
  });

  // Inventar a comarca de alguem e pior que a peca sair com um campo a menos.
  it("sem cidade, o fecho leva so a data", () => {
    expect(cidadeEData(null, new Date("2026-10-07T12:00:00Z"))).toBe("7 de outubro de 2026");
    expect(cidadeEData("Guariba", new Date("2026-10-07T12:00:00Z"))).toBe(
      "Guariba, 7 de outubro de 2026",
    );
  });
});

describe("quem assina a peca", () => {
  const TODOS = [{ id: "a" }, { id: "b" }, { id: "c" }];

  // Em banca de um ou dois a resposta e sempre "todos", e ninguem deveria
  // precisar marcar nada.
  it("vazio significa todos", () => {
    expect(advogadosDaPeca(TODOS, [])).toHaveLength(3);
    expect(advogadosDaPeca(TODOS, null)).toHaveLength(3);
    expect(advogadosDaPeca(TODOS, undefined)).toHaveLength(3);
  });

  it("escolhidos saem na ordem do escritorio, so eles", () => {
    expect(advogadosDaPeca(TODOS, ["c", "a"]).map((x) => x.id)).toEqual(["a", "c"]);
  });

  // Uma procuracao sem outorgado nao e um documento incompleto: e um
  // documento que nao serve para nada.
  it("escolha que nao casa com ninguem cai em todos, nao em nenhum", () => {
    expect(advogadosDaPeca(TODOS, ["desligado"])).toHaveLength(3);
  });

  it("escritorio sem advogado nenhum continua sem", () => {
    expect(advogadosDaPeca([], ["a"])).toEqual([]);
  });
});

describe("a numeracao do contrato que ja vem no sistema", () => {
  const linhas = MODELO_PADRAO.CONTRATO.map((l) => l.texto);
  const CLAUSULA = /^CLAUSULA (\d+)ª — /;
  const ITEM = /^(\d+)\.(\d+)\. /;

  it("as clausulas vao de 1 a N, sem pular e sem repetir", () => {
    // Renumerar clausula a mao e exatamente o que sai errado calado: um
    // contrato com duas "CLAUSULA 3ª" so e descoberto por quem le o papel.
    const numeros = linhas
      .map((t) => CLAUSULA.exec(t)?.[1])
      .filter(Boolean)
      .map(Number);
    expect(numeros.length).toBeGreaterThan(5);
    expect(numeros).toEqual(numeros.map((_, i) => i + 1));
  });

  it("cada item esta sob a clausula do proprio numero, em sequencia", () => {
    let clausula = 0;
    let esperado = 1;
    for (const t of linhas) {
      const nova = CLAUSULA.exec(t);
      if (nova) {
        clausula = Number(nova[1]);
        esperado = 1;
        continue;
      }
      const item = ITEM.exec(t);
      if (!item) continue;
      expect([Number(item[1]), Number(item[2])]).toEqual([clausula, esperado]);
      esperado += 1;
    }
  });

  it("toda remissao a um item aponta para um item que existe", () => {
    // "o previsto no item 3.2" depois de uma renumeracao aponta para outra
    // coisa — e continua sendo uma frase perfeitamente legivel.
    const existentes = new Set(
      linhas.map((t) => ITEM.exec(t)).filter(Boolean).map((m) => `${m![1]}.${m![2]}`),
    );
    const citados = linhas.flatMap((t) => [...t.matchAll(/item (\d+\.\d+)/g)].map((m) => m[1]));
    expect(citados.length).toBeGreaterThan(0);
    for (const c of citados) expect(existentes).toContain(c);
  });

  it("a clausula da natureza alimentar cita a lei que a criou", () => {
    // A Lei 15.472/2026 alterou os artigos 22 e 24 do Estatuto da Advocacia.
    // Citar o dispositivo e o que poupa a discussao sobre a classificacao do
    // credito na hora da cobranca.
    const texto = linhas.join("\n");
    expect(texto).toContain("CLAUSULA 2ª — DA NATUREZA ALIMENTAR DOS HONORARIOS");
    expect(texto).toContain("Lei nº 15.472, de 21 de julho de 2026");
    expect(texto).toContain("artigo 22, § 9º, da Lei nº 8.906/94");
    expect(texto).toContain("artigo 24 da Lei nº 8.906/94");
    expect(texto).toContain("natureza alimentar");
    expect(texto).toContain("credito privilegiado");
  });

  it("continua citando o artigo do CPC que esta em vigor, e nao o revogado", () => {
    const texto = linhas.join("\n");
    expect(texto).toContain("artigo 784, inciso III");
    // O 585, II e do CPC de 1973. Modelo de escritorio ainda carrega esse erro.
    expect(texto).not.toContain("585");
  });
});
