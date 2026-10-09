// Importacao de clientes por planilha: leitor, regras e banco.
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lerPlanilha, PlanilhaInvalida, serieParaData, separarCsv, separadorDe, formatoEhData, type Celula } from "../src/lib/planilha";
import {
  classificarLinhas,
  interpretarLinha,
  lerData,
  lerDocumento,
  lerTelefone,
  sugerirMapeamento,
  type Mapeamento,
} from "../src/lib/importacao-clientes";
import { qualificacaoDoCliente } from "../src/lib/modelos-do-escritorio";

/** CPF valido a partir de 9 digitos. */
function cpf(base: string): string {
  const d = base.split("").map(Number);
  for (const n of [9, 10]) {
    const soma = d.slice(0, n).reduce((s, x, i) => s + x * (n + 1 - i), 0);
    const r = (soma * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}
const CPF_COM_ZERO = cpf("012345678"); // comeca com 0
const CPF_A = cpf("529982247");
const CPF_B = cpf("111444777");

const cel = (texto: string, extra: Partial<Celula> = {}): Celula => ({ texto, numero: false, cientifica: false, data: false, ...extra });

async function xlsx(): Promise<Buffer> {
  const z = new JSZip();
  z.file("[Content_Types].xml", "<Types/>");
  z.file("xl/workbook.xml", `<workbook><workbookPr/><sheets><sheet name="Clientes" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  z.file("xl/_rels/workbook.xml.rels", `<Relationships><Relationship Id="rId1" Target="worksheets/planilha.xml"/></Relationships>`);
  z.file(
    "xl/sharedStrings.xml",
    `<sst><si><t>Nome do Cliente</t></si><si><t>CPF/CNPJ</t></si><si><t>Data de Nascimento</t></si><si><t>Celular</t></si><si><r><t>Jo&amp;</t></r><r><t>ana D'Arc</t></r><rPh><t>X</t></rPh></si><si><t>Município</t></si></sst>`,
  );
  z.file(
    "xl/styles.xml",
    `<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>`,
  );
  z.file(
    "xl/worksheets/planilha.xml",
    `<worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>5</v></c></row>
      <row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2"><v>${Number(CPF_COM_ZERO)}</v></c><c r="C2" s="1"><v>29295</v></c><c r="E2" t="inlineStr"><is><t>Ribeirão Preto</t></is></c></row>
      <row r="3"><c r="A3" t="str"><v>Empresa X</v></c><c r="B3"><v>1.12223330001E+13</v></c></row>
      <row r="5"><c r="A5" t="inlineStr"><is><t>Depois da linha vazia</t></is></c><c r="D5"><v>16999990000</v></c></row>
    </sheetData></worksheet>`,
  );
  return Buffer.from(await z.generateAsync({ type: "nodebuffer" }));
}

describe("leitor de planilha", () => {
  it("le .xlsx: texto compartilhado, rich text sem fonetica, inline, numero, data, cientifica e buraco", async () => {
    const p = await lerPlanilha(await xlsx());
    expect(p.formato).toBe("XLSX");
    expect(p.aba).toBe("Clientes");
    expect(p.linhas[0].map((c) => c.texto)).toEqual(["Nome do Cliente", "CPF/CNPJ", "Data de Nascimento", "Celular", "Município"]);
    const [nome, doc, nasc, , cidade] = p.linhas[1];
    expect(nome.texto).toBe("Jo&ana D'Arc");
    expect(doc).toMatchObject({ texto: CPF_COM_ZERO.slice(1), numero: true, cientifica: false });
    expect(nasc).toMatchObject({ texto: "1980-03-15", data: true });
    expect(cidade.texto).toBe("Ribeirão Preto");
    expect(p.linhas[2][1].cientifica).toBe(true);
    expect(p.linhas[3]).toEqual([]); // linha 4 nao existe no XML
    expect(p.linhas[4][3].texto).toBe("16999990000");
    expect(p.linhas[4][1].texto).toBe(""); // coluna pulada
  });

  it("le CSV do Excel brasileiro: Windows-1252, ponto e virgula, aspas e quebra dentro de aspas", async () => {
    const texto = 'Nome;CPF;Obs\r\n"Conceição Araújo";123;"linha um\nlinha dois"\r\n"Diz ""oi""";;\r\n';
    const bytes = Buffer.from(new TextEncoder().encode(texto).length ? [...texto].map((c) => c.charCodeAt(0)) : []);
    const p = await lerPlanilha(bytes);
    expect(p.formato).toBe("CSV");
    expect(p.linhas[1][0].texto).toBe("Conceição Araújo");
    expect(p.linhas[1][2].texto).toBe("linha um\nlinha dois");
    expect(p.linhas[2][0].texto).toBe('Diz "oi"');
    expect(separadorDe("a,b,c")).toBe(",");
    expect(separadorDe("a\tb")).toBe("\t");
    expect(separarCsv("a;b\n", ";")).toEqual([["a", "b"]]);
  });

  it("recusa .xls antigo com a instrucao, e arquivo vazio", async () => {
    await expect(lerPlanilha(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2]))).rejects.toThrow(/Salvar como/);
    await expect(lerPlanilha(Buffer.alloc(0))).rejects.toBeInstanceOf(PlanilhaInvalida);
  });

  it("datas do Excel", () => {
    expect(serieParaData(29295)).toBe("1980-03-15");
    expect(serieParaData(45573)).toBe("2024-10-08");
    expect(formatoEhData("dd/mm/yyyy")).toBe(true);
    expect(formatoEhData("0.00")).toBe(false);
    expect(formatoEhData('"R$" #,##0')).toBe(false);
  });
});

describe("regras da importacao", () => {
  it("sugere as colunas pelos titulos que os sistemas usam", () => {
    const m = sugerirMapeamento([
      "Nome do Cliente", "CPF/CNPJ", "Celular", "E-mail", "Data de Nascimento", "Endereço",
      "Nº", "Bairro", "Município", "UF", "CEP", "Profissão", "Estado Civil", "RG", "Obs.", "Código interno",
    ]);
    expect(m).toEqual([
      "nome", "documento", "telefone", "email", "nascimento", "enderecoCompleto",
      "numero", "bairro", "cidade", "uf", "cep", "profissao", "estadoCivil", "rg", "observacoes", null,
    ]);
    // Cada campo vai para uma coluna so.
    expect(sugerirMapeamento(["Nome", "Nome fantasia"]).filter((c) => c === "nome")).toHaveLength(1);
  });

  it("devolve o zero do CPF SO quando o digito fecha", () => {
    const comZero = lerDocumento(cel(CPF_COM_ZERO.slice(1), { numero: true }));
    expect(comZero.valor?.replace(/\D/g, "")).toBe(CPF_COM_ZERO);
    expect(comZero.aviso).toMatch(/zero da frente/);
    // Como TEXTO, faltando digito: nao se adivinha.
    expect(lerDocumento(cel(CPF_COM_ZERO.slice(1))).problema).toMatch(/10 digito/);
    // Numero que nao fecha nem com zero: recusa.
    const quebrado = CPF_COM_ZERO.slice(1, -1) + String((Number(CPF_COM_ZERO.slice(-1)) + 1) % 10);
    expect(lerDocumento(cel(quebrado, { numero: true })).problema).toBeDefined();
    expect(lerDocumento(cel("1.12223330001E+13", { numero: true, cientifica: true })).problema).toMatch(/notacao cientifica/);
    expect(lerDocumento(cel("123.456.789-00")).problema).toMatch(/nao fecha/);
    expect(lerDocumento(cel(CPF_A)).valor).toMatch(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/);
    expect(lerDocumento(undefined).valor).toBeNull();
  });

  it("telefone e data em varios formatos", () => {
    expect(lerTelefone("+55 (16) 99999-0000")).toBe("(16) 99999-0000");
    expect(lerTelefone("1633221100")).toBe("(16) 3322-1100");
    expect(lerTelefone("99999-0000")).toBeNull();
    const hoje = new Date("2026-10-09T12:00:00Z");
    expect(lerData(cel("15/03/1980"), hoje)).toBe("1980-03-15");
    expect(lerData(cel("15-03-80"), hoje)).toBe("1980-03-15");
    expect(lerData(cel("1980-03-15"), hoje)).toBe("1980-03-15");
    expect(lerData(cel("29295", { numero: true }), hoje)).toBe("1980-03-15");
    expect(lerData(cel("31/02/1980"), hoje)).toBeNull();
    expect(lerData(cel("01/01/2030"), hoje)).toBeNull();
  });

  it("campo acessorio ruim vira aviso; so nome e documento barram", () => {
    const mapa: Mapeamento = ["nome", "documento", "email", "telefone", "uf", "cep"];
    const ok = interpretarLinha(
      [cel("  Maria   Silva "), cel(CPF_A), cel("maria@"), cel("123"), cel("XX"), cel("1310100", { numero: true })],
      mapa,
    );
    expect(ok.problemas).toEqual([]);
    expect(ok.dados.nome).toBe("Maria Silva");
    expect(ok.dados.email).toBeNull();
    expect(ok.dados.telefone).toBeNull();
    expect(ok.dados.endereco).toEqual({ cep: "01310100" });
    expect(ok.avisos.join(" | ")).toMatch(/e-mail .* invalido.*telefone.*CEP.*UF/);

    const ruim = interpretarLinha([cel(""), cel("123")], mapa);
    expect(ruim.problemas).toContain("sem nome");
  });

  it("classifica: novo, ja cadastrado, repetido na planilha, problema e vazia", () => {
    const mapa: Mapeamento = ["nome", "documento"];
    const linhas = [
      [cel("Ana"), cel(CPF_A)],
      [cel("Bruno"), cel(CPF_B)], // ja existe pelo CPF
      [cel("Ana de novo"), cel(CPF_A)], // repetido no arquivo
      [cel("Carla"), cel("")],
      [cel("carla"), cel("")], // repetido pelo nome, sem CPF
      [cel("Diego"), cel("")], // existe cliente Diego no sistema
      [cel("Elisa"), cel(CPF_COM_ZERO)], // existe Elisa SEM CPF no sistema
      [cel(""), cel("")],
      [cel("Fabio"), cel("999")],
    ].map((celulas, i) => ({ numero: i + 2, celulas }));
    const r = classificarLinhas(linhas, mapa, {
      documentos: new Set([CPF_B]),
      nomesSemDocumento: new Set(["ELISA"]),
      nomes: new Set(["DIEGO", "ELISA"]),
    });
    expect(r.map((l) => l.situacao)).toEqual([
      "NOVO", "JA_CADASTRADO", "REPETIDO_NA_PLANILHA", "NOVO", "REPETIDO_NA_PLANILHA", "JA_CADASTRADO", "JA_CADASTRADO", "VAZIA", "PROBLEMA",
    ]);
    expect(r[2].motivo).toBe("mesmo CPF/CNPJ da linha 2");
    expect(r[6].motivo).toMatch(/complete o CPF/);
  });
});

describe("qualificacao do cliente pessoa fisica", () => {
  const base = { nome: "Ana Paula Martins", documento: CPF_A, email: null, telefone: null, endereco: { logradouro: "Rua A", numero: "10", cidade: "Guariba", uf: "SP" } };

  it("sem os campos novos, o texto de sempre", () => {
    expect(qualificacaoDoCliente(base)).toMatch(/^Ana Paula Martins, inscrito no CPF sob o nº [\d.-]+, com endereco em Rua A, 10, Guariba, SP$/);
  });

  it("com nacionalidade, estado civil, profissao e RG — no feminino quando ela escreveu assim", () => {
    const q = qualificacaoDoCliente({ ...base, nacionalidade: "brasileira", estadoCivil: "casada", profissao: "professora", rg: "12.345.678-9" });
    expect(q).toMatch(/^Ana Paula Martins, brasileira, casada, professora, portadora do RG nº 12\.345\.678-9, inscrita no CPF/);
    const m = qualificacaoDoCliente({ ...base, nome: "Joao", nacionalidade: "brasileiro", rg: "1" });
    expect(m).toMatch(/portador do RG nº 1, inscrito no CPF/);
  });
});

// ---------------------------------------------------------------------------
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { analisarPlanilha, desfazerImportacao, importarPlanilha } from "../src/lib/importacao-do-escritorio";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;
let escritorio = "";

d("importacao no banco", () => {
  beforeAll(async () => {
    const e = await prismaPlataforma().escritorio.create({ data: { slug: `importa-${Date.now()}`, nome: "Escritorio que Importa" } });
    escritorio = e.id;
    await comEscritorio(escritorio, (db) => db.cliente.create({ data: semEscritorio({ nome: "Bruno Ja Existe", documento: CPF_B }) }));
  });
  afterAll(async () => {
    if (escritorio) await prismaPlataforma().escritorio.delete({ where: { id: escritorio } }).catch(() => {});
    await prismaPlataforma().$disconnect();
  });

  const csv = () =>
    Buffer.from(
      [
        "Nome;CPF;Celular;Nascimento;Profissao;Cidade;UF",
        `Ana Importada;${CPF_A};16999990001;15/03/1980;professora;Guariba;SP`,
        `Bruno de Novo;${CPF_B};;;;;`,
        `Sem Documento;;;;;;`,
        `Errado;123;;;;;`,
        "",
        "",
      ].join("\r\n"),
      "utf8",
    );

  it("analisa sem gravar nada", async () => {
    const a = await analisarPlanilha(escritorio, csv());
    expect(a.cabecalho).toEqual(["Nome", "CPF", "Celular", "Nascimento", "Profissao", "Cidade", "UF"]);
    expect(a.mapeamento).toEqual(["nome", "documento", "telefone", "nascimento", "profissao", "cidade", "uf"]);
    expect(a.contagem).toMatchObject({ NOVO: 2, JA_CADASTRADO: 1, PROBLEMA: 1 });
    expect(a.linhas.map((l) => l.linha)).toEqual([2, 3, 4, 5]);
    expect(await comEscritorio(escritorio, (db) => db.cliente.count())).toBe(1);
  });

  it("importa so os novos, com a qualificacao, e marca o lote", async () => {
    const a = await analisarPlanilha(escritorio, csv());
    const r = await importarPlanilha(escritorio, "clientes.csv", "Dra. Teste", csv(), a.mapeamento);
    expect(r.importados).toBe(2);
    const ana = await comEscritorio(escritorio, (db) => db.cliente.findFirstOrThrow({ where: { nome: "Ana Importada" } }));
    expect(ana).toMatchObject({ telefone: "(16) 99999-0001", profissao: "professora", importacaoId: r.importacaoId });
    expect(ana.nascimento?.toISOString().slice(0, 10)).toBe("1980-03-15");
    expect(ana.endereco).toEqual({ cidade: "Guariba", uf: "SP" });

    // Importar de novo a mesma planilha nao duplica ninguem.
    const segunda = await analisarPlanilha(escritorio, csv());
    expect(segunda.contagem.NOVO).toBe(0);
  });

  it("desfazer apaga o lote, menos quem ja tem algo ligado", async () => {
    const imp = await comEscritorio(escritorio, (db) => db.importacaoDeClientes.findFirstOrThrow());
    expect(imp).toMatchObject({ importados: 2, jaExistiam: 1, recusados: 1, feitaPor: "Dra. Teste", nomeDoArquivo: "clientes.csv" });
    const ana = await comEscritorio(escritorio, (db) => db.cliente.findFirstOrThrow({ where: { nome: "Ana Importada" } }));
    await comEscritorio(escritorio, (db) =>
      db.processo.create({ data: semEscritorio({ numero: `0000001-00.2026.8.26.${Date.now() % 10000}`, clienteId: ana.id }) }),
    );
    const r = await desfazerImportacao(escritorio, imp.id);
    expect(r).toEqual({ apagados: 1, mantidos: 1 });
    const nomes = (await comEscritorio(escritorio, (db) => db.cliente.findMany({ select: { nome: true } }))).map((c) => c.nome).sort();
    expect(nomes).toEqual(["Ana Importada", "Bruno Ja Existe"]);
    // Desfazer de novo nao faz nada.
    expect(await desfazerImportacao(escritorio, imp.id)).toEqual({ apagados: 0, mantidos: 1 });
  });
});
