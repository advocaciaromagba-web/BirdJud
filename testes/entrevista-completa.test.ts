// Entrevista no metodo do sistema da Advocacia Roma: anotacoes a parte, tipo
// de acao, encerrar, PDF e o texto para a peticao inicial.
//
// O que se prova: o texto da inicial nao inventa (lacuna vira [PREENCHER] e o
// cadastro incompleto e listado), so sai depois de encerrar e organizar com
// o cliente ligado, e o PDF da entrevista e gerado com o que foi dito.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { camposFaltando, montarPromptMinuta, type ClienteParaMinuta } from "../src/lib/minuta-prompt";
import { gerarPdfEntrevista } from "../src/lib/entrevista-pdf";
import type { AnaliseDaEntrevista } from "../src/lib/entrevista";
import {
  EntrevistaIncompleta,
  anotar,
  criarEntrevista,
  encerrar,
  gerarMinuta,
  ligarAoCliente,
  pdfDaEntrevista,
} from "../src/lib/entrevista-do-escritorio";

const ANALISE: AnaliseDaEntrevista = {
  area: "Civel",
  resumo: "Inquilino sem pagar ha tres meses.",
  fatos: ["Contrato de 2024", "Sem pagar desde julho"],
  pretensoes: ["Despejo", "Receber os alugueis"],
  documentosCitados: ["Contrato de locacao"],
  documentosQueFaltam: ["Notificacao ao inquilino"],
  testemunhas: [],
  pontosDeAtencao: ["Conferir se houve notificacao"],
  perguntasEmAberto: ["Ha fiador?"],
  urgencia: "MEDIA",
  valorEnvolvido: "R$ 6.000,00",
};

const CLIENTE: ClienteParaMinuta = {
  nome: "Maria Aparecida Souza",
  documento: "529.982.247-25",
  rg: null,
  nacionalidade: "brasileira",
  estadoCivil: null,
  profissao: "comerciante",
  email: null,
  telefone: "16 99999-0000",
  endereco: { logradouro: "Rua das Flores", numero: "10", bairro: "Centro", cidade: "Guariba", uf: "SP", cep: "14840-000" },
};

describe("texto para a peticao inicial", () => {
  it("lista o que falta no cadastro e marca a lacuna, sem inventar", () => {
    expect(camposFaltando(CLIENTE)).toEqual(["Estado civil"]);
    const texto = montarPromptMinuta(CLIENTE, { nome: "Dra. Ana", oab: null, escritorio: "Banca" }, ANALISE, "Pedir liminar");
    expect(texto).toContain("[PREENCHER: estado civil]");
    expect(texto).toContain("[PREENCHER: OAB]");
    expect(texto).toContain("Faltam: Estado civil.");
    expect(texto).toContain("- Contrato de locacao");
    expect(texto).toContain("DOCUMENTOS AINDA NAO OBTIDOS (nao afirme que estao anexados):\n- Notificacao ao inquilino");
    expect(texto).toContain("Valor mencionado pelo cliente: R$ 6.000,00");
    expect(texto).toContain("ORIENTACOES ESPECIFICAS DO ADVOGADO RESPONSAVEL:\nPedir liminar");
    // Sem RG no cadastro (CIN usa o CPF): nao pede RG.
    expect(texto).not.toContain("PREENCHER: RG");
  });

  it("o PDF da entrevista sai com o que foi dito", async () => {
    const pdf = await gerarPdfEntrevista({
      escritorio: "Banca de Teste",
      titulo: "Entrevista — despejo",
      nomeCliente: "Maria",
      documentoCliente: null,
      nomeAdvogado: "Dra. Ana",
      iniciadaEm: new Date(),
      encerradaEm: null,
      origemTranscricao: "LOCAL",
      transcricao: "[CLIENTE] O inquilino nao paga desde julho — e ja avisei.",
      anotacoes: "Conferir fiador.",
      analise: ANALISE,
      tipoAcao: "despejo",
      perguntas: ["Ha contrato escrito?"],
    });
    expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe("%PDF");
  });
});

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

d("fluxo da entrevista", () => {
  let escritorio = "";
  let advogada = "";
  let cliente = "";

  beforeAll(async () => {
    escritorio = (await prismaPlataforma().escritorio.create({ data: { slug: `entrev-${Date.now()}`, nome: "Banca da Entrevista" } })).id;
    await comEscritorio(escritorio, async (db) => {
      advogada = (await db.usuario.create({
        data: semEscritorio({ nome: "Dra. Ana", email: `ana-${Date.now()}@e.test`, senhaHash: "x", papel: "ADVOGADO", oab: "123456/SP" }),
      })).id;
      cliente = (await db.cliente.create({ data: semEscritorio({ nome: "Maria Aparecida Souza", documento: "52998224725" }) })).id;
    });
  });

  afterAll(async () => {
    if (escritorio) await prismaPlataforma().escritorio.delete({ where: { id: escritorio } }).catch(() => {});
    await prismaPlataforma().$disconnect();
  });

  it("anotacoes e origem sao guardadas; encerrar e reabrir nao apagam nada", async () => {
    const e = await criarEntrevista(escritorio, { nome: "Maria", assunto: "Inquilino nao paga o aluguel ha meses", usuarioId: advogada });
    const anotada = await anotar(escritorio, e.id, "[CLIENTE] Ele nao paga.", { anotacoes: "Conferir fiador", origem: "LOCAL" });
    expect(anotada.anotacoes).toBe("Conferir fiador");
    expect(anotada.origemTranscricao).toBe("LOCAL");
    // Corrigir a mao depois nao apaga a origem por voz.
    expect((await anotar(escritorio, e.id, "[CLIENTE] Ele nao paga desde julho.")).origemTranscricao).toBe("LOCAL");
    expect((await encerrar(escritorio, e.id)).encerradaEm).not.toBeNull();
    expect((await encerrar(escritorio, e.id, true)).encerradaEm).toBeNull();
  });

  it("o texto da inicial so sai encerrada, organizada e com cliente", async () => {
    const e = await criarEntrevista(escritorio, { nome: "Maria", assunto: "Despejo por falta de pagamento", usuarioId: advogada });
    await expect(gerarMinuta(escritorio, e.id, advogada)).rejects.toBeInstanceOf(EntrevistaIncompleta);
    await encerrar(escritorio, e.id);
    await expect(gerarMinuta(escritorio, e.id, advogada)).rejects.toThrow(/Organize/);
    await comEscritorio(escritorio, (db) => db.entrevista.update({ where: { id: e.id }, data: { analise: ANALISE } }));
    await expect(gerarMinuta(escritorio, e.id, advogada)).rejects.toThrow(/cliente/);
    await ligarAoCliente(escritorio, e.id, cliente);

    // Cadastro incompleto: devolve o que falta e nao monta, ate a pessoa confirmar.
    const pendente = await gerarMinuta(escritorio, e.id, advogada);
    expect(pendente.prompt).toBeNull();
    expect(pendente.faltando).toContain("Estado civil");

    const pronto = await gerarMinuta(escritorio, e.id, advogada, { ignorarPendencias: true });
    expect(pronto.prompt).toContain("OAB: 123456/SP");
    expect(pronto.prompt).toContain("Nome: Maria Aparecida Souza");
    const gravada = await comEscritorio(escritorio, (db) => db.entrevista.findFirstOrThrow({ where: { id: e.id } }));
    expect(gravada.minutaPrompt).toBe(pronto.prompt);

    const { pdf, nome } = await pdfDaEntrevista(escritorio, e.id);
    expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe("%PDF");
    expect(nome).toMatch(/^Entrevista \d{4}-\d{2}-\d{2} - Maria\.pdf$/);
  });
});
