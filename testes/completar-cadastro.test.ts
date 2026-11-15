// Completar o cadastro pelos documentos: o caminho inteiro, com a IA trocada
// por uma resposta fixa. O que se prova e o que protege o cadastro: so campo
// vazio, documento de outra pessoa nao preenche nada, boleto da conta nao
// entra na lista geral de arquivos.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let resposta = "{}";
let recebidos: string[] = [];
vi.mock("../src/lib/ia", async (original) => ({
  ...(await original<typeof import("../src/lib/ia")>()),
  pedirSobreDocumentos: vi.fn(async (_s: string, anexos: { nome: string }[]) => {
    recebidos = anexos.map((a) => a.nome);
    return { texto: resposta, modelo: "teste", tokensEntrada: 1000, tokensSaida: 100 };
  }),
}));

import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { FORA_OS_ANEXOS_DE_CONTA, guardarArquivo } from "../src/lib/arquivos";
import { cadastrosIncompletos, completarPelosDocumentos } from "../src/lib/completar-cadastro";

const d = process.env.DATABASE_URL ? describe : describe.skip;
const marca = Date.now();
const PDF = Buffer.from("%PDF-1.4 teste");
const lido = (campos: Record<string, string>, confianca = "ALTA") =>
  JSON.stringify({ campos: Object.fromEntries(Object.entries(campos).map(([k, valor]) => [k, { valor, confianca, origem: "rg.pdf" }])) });

d("completar o cadastro pelos documentos", () => {
  let esc = "";
  let usuario = "";
  let maria = "";

  beforeAll(async () => {
    process.env.RAIZ_ARQUIVOS = await mkdtemp(join(tmpdir(), "birdjud-cadastro-"));
    esc = (await prismaPlataforma().escritorio.create({ data: { slug: `cad-${marca}`, nome: "Cadastro" } })).id;
    await comEscritorio(esc, (db) => db.moduloContratado.create({ data: semEscritorio({ modulo: "NUVEM", ativo: true, franquia: 10 }) }));
    usuario = (await comEscritorio(esc, (db) => db.usuario.create({ data: semEscritorio({ nome: "Quem", email: `cad-${marca}@teste.br`, senhaHash: "x", papel: "ADMIN" }) }))).id;
    maria = (await comEscritorio(esc, (db) => db.cliente.create({ data: semEscritorio({ nome: "Maria Aparecida dos Santos", profissao: "professora" }) }))).id;
    for (const nome of ["rg.pdf", "sentenca.pdf", "comprovante de pagamento.pdf"]) {
      await guardarArquivo(esc, { nome, tipo: "application/pdf", conteudo: PDF, usuarioId: usuario, clienteId: maria });
    }
  });

  afterAll(async () => {
    await prismaPlataforma().escritorio.delete({ where: { id: esc } }).catch(() => {});
  });

  it("lista quem esta incompleto e quantos documentos servem", async () => {
    const lista = await cadastrosIncompletos(esc);
    expect(lista).toHaveLength(1);
    expect(lista[0].documentos).toBe(1);
    expect(lista[0].falta).not.toContain("profissao");
  });

  it("documento em nome de outra pessoa nao preenche nada", async () => {
    resposta = lido({ nome: "José Carlos dos Santos", rg: "111 SSP/BA", estadoCivil: "casado" });
    const r = await completarPelosDocumentos(esc, maria, usuario);
    expect(r.situacao).toBe("NAO_E_DO_CLIENTE");
    // So o RG foi para a IA: sentenca e comprovante de pagamento ficaram.
    expect(recebidos).toEqual(["rg.pdf"]);
    const c = await comEscritorio(esc, (db) => db.cliente.findFirstOrThrow({ where: { id: maria } }));
    expect(c.rg).toBeNull();
    expect(c.camposLidosPorIA).toEqual([]);
  });

  it("preenche so o que esta vazio, marca como lido por IA e registra o consumo", async () => {
    resposta = lido({ nome: "MARIA APARECIDA DOS SANTOS", rg: "111 SSP/BA", estadoCivil: "casada", profissao: "advogada", documento: "529.982.247-25", telefone: "71999990000" });
    const r = await completarPelosDocumentos(esc, maria, usuario);
    expect(r.situacao).toBe("PREENCHIDO");
    const c = await comEscritorio(esc, (db) => db.cliente.findFirstOrThrow({ where: { id: maria } }));
    expect(c.rg).toBe("111 SSP/BA");
    expect(c.estadoCivil).toBe("casada");
    expect(c.documento).toBe("529.982.247-25");
    expect(c.profissao).toBe("professora");
    expect(c.telefone).toBeNull();
    expect([...c.camposLidosPorIA].sort()).toEqual(["documento", "estadoCivil", "rg"]);
    if (r.situacao === "PREENCHIDO") expect(r.aindaFalta).toEqual(["nascimento", "nacionalidade", "endereco"]);
    const analises = await comEscritorio(esc, (db) => db.analiseIA.count({ where: { tipo: "LEITURA_CADASTRO" } }));
    expect(analises).toBe(2);
  });

  it("boleto e comprovante de conta ficam fora da lista geral de arquivos", async () => {
    const boleto = await guardarArquivo(esc, { nome: "boleto.pdf", tipo: "application/pdf", conteudo: PDF, usuarioId: usuario });
    await comEscritorio(esc, (db) =>
      db.lancamento.create({ data: semEscritorio({ descricao: "Energia", valorCentavos: 1000, tipo: "DESPESA", competencia: "2026-11", arquivoId: boleto.id }) }),
    );
    const lista = await comEscritorio(esc, (db) => db.arquivo.findMany({ where: FORA_OS_ANEXOS_DE_CONTA, select: { nome: true } }));
    expect(lista.map((a) => a.nome)).not.toContain("boleto.pdf");
    expect(lista).toHaveLength(3);
  });
});
