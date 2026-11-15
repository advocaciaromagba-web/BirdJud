import { describe, expect, it } from "vitest";
import { camposFaltando, decidirPreenchimento, instrucaoDaPasta, mesmoNome, motivoDeNaoSerDoCliente, type ClienteParaCompletar } from "../src/lib/cadastro-pelos-documentos";
import { categoriaDoArquivo, escolherDocumentos } from "../src/lib/documentos-do-cliente";
import type { Leitura } from "../src/lib/leitura-documento";

const vazio: ClienteParaCompletar = { nome: "Maria Aparecida dos Santos", documento: null, rg: null, nascimento: null, nacionalidade: null, estadoCivil: null, profissao: null, endereco: null };
const campo = (valor: string, confianca: "ALTA" | "MEDIA" | "BAIXA" = "ALTA", origem = "rg.pdf") => ({ valor, confianca, origem });
const leitura = (campos: Record<string, ReturnType<typeof campo>>): Leitura => ({ campos, observacoes: [] }) as unknown as Leitura;
const CPF = "529.982.247-25";

describe("o que falta no cadastro", () => {
  it("pessoa sem nada: tudo", () => {
    expect(camposFaltando(vazio)).toEqual(["documento", "rg", "nascimento", "nacionalidade", "estadoCivil", "profissao", "endereco"]);
  });
  it("empresa nao tem RG nem estado civil: so o endereco", () => {
    expect(camposFaltando({ ...vazio, documento: "11.222.333/0001-81" })).toEqual(["endereco"]);
  });
  it("endereco com rua e cidade conta como preenchido", () => {
    expect(camposFaltando({ ...vazio, endereco: { logradouro: "Rua A", cidade: "Salvador" } })).not.toContain("endereco");
    expect(camposFaltando({ ...vazio, endereco: { cep: "40000000" } })).toContain("endereco");
  });
});

describe("os documentos sao deste cliente?", () => {
  it("mesmo nome, com ou sem acento, preposicao e nome do meio", () => {
    expect(mesmoNome("Maria Aparecida dos Santos", "MARIA APARECIDA DOS SANTOS")).toBe(true);
    expect(mesmoNome("João d'Ávila", "JOAO D AVILA")).toBe(true);
    expect(mesmoNome("Maria Aparecida dos Santos", "Maria Santos")).toBe(true);
  });
  it("conjuge, filho e homonimo parcial nao passam", () => {
    expect(mesmoNome("Maria Aparecida dos Santos", "José Carlos dos Santos")).toBe(false);
    expect(mesmoNome("Maria Aparecida dos Santos", "Maria Aparecida Souza")).toBe(false);
    expect(mesmoNome("Maria Aparecida dos Santos", "Maria")).toBe(false);
  });
  it("sem nome lido nao da para conferir", () => {
    expect(motivoDeNaoSerDoCliente(vazio, leitura({ rg: campo("123") }))).toMatch(/não trouxe o nome/);
  });
  it("nome de outra pessoa barra tudo", () => {
    expect(motivoDeNaoSerDoCliente(vazio, leitura({ nome: campo("José Carlos dos Santos") }))).toMatch(/não confere/);
  });
  it("nome igual com CPF diferente e homonimo", () => {
    const c = { ...vazio, documento: CPF };
    expect(motivoDeNaoSerDoCliente(c, leitura({ nome: campo(vazio.nome), documento: campo("111.444.777-35") }))).toMatch(/homônimo/);
    expect(motivoDeNaoSerDoCliente(c, leitura({ nome: campo(vazio.nome), documento: campo("52998224725") }))).toBeNull();
    expect(motivoDeNaoSerDoCliente(vazio, leitura({ nome: campo(vazio.nome), documento: campo(CPF) }))).toBeNull();
  });
});

describe("o que entra no cadastro", () => {
  it("so preenche campo vazio", () => {
    const c = { ...vazio, profissao: "professora", rg: "111 SSP/BA" };
    const d = decidirPreenchimento(c, leitura({ profissao: campo("advogada"), rg: campo("999 SSP/SP"), estadoCivil: campo("casada") }));
    expect(d.preencher).toEqual({ estadoCivil: "casada" });
  });
  it("leitura com duvida fica de fora, e diz por que", () => {
    const d = decidirPreenchimento(vazio, leitura({ rg: campo("12.345", "BAIXA"), profissao: campo("lavradora", "MEDIA") }));
    expect(d.preencher).toEqual({ profissao: "lavradora" });
    expect(d.recusados).toEqual([{ campo: "rg", motivo: expect.stringContaining("dúvida") }]);
  });
  it("CPF que nao fecha no digito nao entra", () => {
    const d = decidirPreenchimento(vazio, leitura({ documento: campo("529.982.247-26") }));
    expect(d.preencher.documento).toBeUndefined();
    expect(d.recusados[0].campo).toBe("documento");
    expect(decidirPreenchimento(vazio, leitura({ documento: campo("52998224725") })).preencher.documento).toBe(CPF);
  });
  it("marcador do gerador de pecas nao e lido de volta como valor", () => {
    const d = decidirPreenchimento(vazio, leitura({ rg: campo("[RG NÃO INFORMADO(A)]"), profissao: campo("[PROFISSÃO NÃO INFORMADA]") }));
    expect(d.preencher).toEqual({});
  });
  it("nascimento no futuro ou torto nao entra", () => {
    expect(decidirPreenchimento(vazio, leitura({ nascimento: campo("2999-01-01") })).preencher.nascimento).toBeUndefined();
    expect(decidirPreenchimento(vazio, leitura({ nascimento: campo("1980-03-15") })).preencher.nascimento).toBe("1980-03-15");
  });
  it("endereco so entra inteiro", () => {
    const meio = decidirPreenchimento(vazio, leitura({ logradouro: campo("Rua das Flores"), numero: campo("10") }));
    expect(meio.preencher.endereco).toBeUndefined();
    expect(meio.recusados[0].campo).toBe("endereco");
    const inteiro = decidirPreenchimento(vazio, leitura({ logradouro: campo("Rua das Flores", "ALTA", "conta de luz.pdf"), numero: campo("10"), cidade: campo("Salvador"), uf: campo("BA"), cep: campo("40000-000") }));
    expect(inteiro.preencher.endereco).toEqual({ logradouro: "Rua das Flores", numero: "10", cidade: "Salvador", uf: "BA", cep: "40000000" });
    expect(inteiro.origem.endereco).toBe("conta de luz.pdf");
  });
  it("telefone e e-mail nunca entram por aqui", () => {
    const d = decidirPreenchimento(vazio, leitura({ telefone: campo("71999990000"), email: campo("a@b.com") }));
    expect(d.preencher).toEqual({});
  });
  it("a instrucao manda ignorar os advogados e o terceiro", () => {
    const i = instrucaoDaPasta("Maria");
    expect(i).toContain("OUTORGANTE");
    expect(i).toContain("IGNORE os advogados");
    expect(i).toContain("em nome de OUTRA pessoa");
  });
});

describe("quais arquivos a IA le", () => {
  const arq = (nome: string, tamanhoBytes = 1000, tipo = "application/pdf") => ({ id: nome, nome, tipo, tamanhoBytes });
  const limites = { maximo: 5, bytes: 10_000, tiposLidos: (t: string) => t === "application/pdf" || t === "image/jpeg" };

  it("a exclusao e testada antes da inclusao", () => {
    expect(categoriaDoArquivo("Comprovante de residência.pdf")).toBe("ENDERECO");
    expect(categoriaDoArquivo("Comprovante de pagamento.pdf")).toBeNull();
    expect(categoriaDoArquivo("Petição inicial - contrato de aluguel.pdf")).toBeNull();
    expect(categoriaDoArquivo("RG_frente.jpg")).toBe("PESSOAL");
    expect(categoriaDoArquivo("CNH.pdf")).toBe("PESSOAL");
    expect(categoriaDoArquivo("Procuração assinada.pdf")).toBe("PROCURACAO");
    expect(categoriaDoArquivo("scan0001.pdf")).toBe("GENERICO");
    expect(categoriaDoArquivo("Sentença.pdf")).toBeNull();
  });
  it("ordem de confianca, dois por categoria e teto de arquivos", () => {
    const { escolhidos } = escolherDocumentos(
      [arq("scan1.pdf"), arq("procuracao 1.pdf"), arq("procuracao 2.pdf"), arq("procuracao 3.pdf"), arq("contrato.pdf"), arq("rg.pdf"), arq("comprovante de endereco.pdf"), arq("sentenca.pdf")],
      limites,
    );
    expect(escolhidos.map((e) => e.nome)).toEqual(["rg.pdf", "comprovante de endereco.pdf", "procuracao 1.pdf", "procuracao 2.pdf", "contrato.pdf"]);
  });
  it("tipo que a IA nao le e arquivo que estoura o tamanho ficam de fora", () => {
    const { escolhidos } = escolherDocumentos([arq("rg.docx", 1000, "application/msword"), arq("cnh.pdf", 9_500), arq("rg verso.pdf", 800), arq("conta de luz.pdf", 400)], limites);
    expect(escolhidos.map((e) => e.nome)).toEqual(["cnh.pdf", "conta de luz.pdf"]);
  });
});
