// Modelo do escritorio x modelo do sistema: o escritorio FIXA qual sai.
//
// O que se prova: o modelo enviado passa a valer; fixar o do sistema NAO apaga
// o do escritorio (da para voltar com um clique); os dois se baixam de
// proposito; fixar o do escritorio sem ter mandado um e erro; e excluir apaga
// de vez e volta ao do sistema.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaPlataforma } from "../src/lib/prisma";
import { montarDocx } from "../src/lib/docx";
import { MODELO_PADRAO } from "../src/lib/modelos-padrao";
import {
  ModeloNaoEncontrado,
  arquivoDoModelo,
  fixarModelo,
  guardarModelo,
  modelosVigentes,
  voltarAoPadrao,
} from "../src/lib/modelos-do-escritorio";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

d("fixar o modelo", () => {
  let esc = "";

  beforeAll(async () => {
    esc = (await prismaPlataforma().escritorio.create({ data: { slug: `fixar-${Date.now()}`, nome: "Banca dos Modelos" } })).id;
  });

  afterAll(async () => {
    if (esc) await prismaPlataforma().escritorio.delete({ where: { id: esc } }).catch(() => {});
    await prismaPlataforma().$disconnect();
  });

  const vigente = async () => (await modelosVigentes(esc)).find((m) => m.especie === "PROCURACAO")!;

  it("sem modelo proprio: sai o do sistema, e fixar o do escritorio e erro", async () => {
    expect(await vigente()).toMatchObject({ doEscritorio: false, temProprio: false });
    expect((await arquivoDoModelo(esc, "PROCURACAO")).doEscritorio).toBe(false);
    await expect(fixarModelo(esc, "PROCURACAO", "ESCRITORIO")).rejects.toBeInstanceOf(ModeloNaoEncontrado);
    await expect(arquivoDoModelo(esc, "PROCURACAO", "ESCRITORIO")).rejects.toBeInstanceOf(ModeloNaoEncontrado);
  });

  it("enviado passa a valer; fixar o do sistema guarda o do escritorio", async () => {
    const meu = await montarDocx(MODELO_PADRAO.PROCURACAO);
    await guardarModelo(esc, "PROCURACAO", { nome: "procuracao-timbrada.docx", conteudo: meu });
    expect(await vigente()).toMatchObject({ doEscritorio: true, temProprio: true, nomeDoArquivo: "procuracao-timbrada.docx" });
    expect((await arquivoDoModelo(esc, "PROCURACAO")).doEscritorio).toBe(true);

    await fixarModelo(esc, "PROCURACAO", "SISTEMA");
    expect(await vigente()).toMatchObject({ doEscritorio: false, temProprio: true });
    expect((await arquivoDoModelo(esc, "PROCURACAO")).doEscritorio).toBe(false);
    // Guardado: baixa de proposito, igual ao que foi enviado.
    const guardado = await arquivoDoModelo(esc, "PROCURACAO", "ESCRITORIO");
    expect(guardado.doEscritorio).toBe(true);
    expect(Buffer.compare(guardado.conteudo, meu)).toBe(0);
    expect((await arquivoDoModelo(esc, "PROCURACAO", "SISTEMA")).nomeDoArquivo).toMatch(/^modelo-/);

    await fixarModelo(esc, "PROCURACAO", "ESCRITORIO");
    expect((await vigente()).doEscritorio).toBe(true);
  });

  it("excluir apaga o do escritorio e volta ao do sistema", async () => {
    await voltarAoPadrao(esc, "PROCURACAO");
    expect(await vigente()).toMatchObject({ doEscritorio: false, temProprio: false });
  });
});
