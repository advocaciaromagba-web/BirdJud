// Gravação longa de entrevista: o arquivo chega em pedaços (18/10/2026).
//
// O que protege o escritorio: o pedaco reenviado nao duplica audio, o fora de
// ordem nao corrompe, o grande demais nao enche o disco, e o envio abandonado
// some sozinho.
import { createHash } from "node:crypto";
import { mkdtemp, readFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  anexarAoEnvio,
  caminhoDo,
  concluirEnvio,
  descartarEnvio,
  EnvioInvalido,
  fluxoDoDisco,
  limparEnviosVelhos,
  raiz,
  tamanhoDoEnvio,
} from "../src/lib/armazenamento";

const ESC = "escritorio_envio_teste";
const MB = 1024 * 1024;
let raizAnterior: string | undefined;

beforeAll(async () => {
  raizAnterior = process.env.RAIZ_ARQUIVOS;
  process.env.RAIZ_ARQUIVOS = await mkdtemp(join(tmpdir(), "birdjud-envio-"));
});

afterAll(() => {
  if (raizAnterior === undefined) delete process.env.RAIZ_ARQUIVOS;
  else process.env.RAIZ_ARQUIVOS = raizAnterior;
});

const pedaco = (n: number, byte: number) => Buffer.alloc(n, byte);

describe("envio em partes", () => {
  it("junta os pedaços em ordem e conclui com o hash do conteúdo inteiro", async () => {
    const a = pedaco(3 * MB, 1);
    const b = pedaco(2 * MB, 2);
    expect(await anexarAoEnvio(ESC, "envio_ordem_000001", 0, a, 10 * MB)).toBe(3 * MB);
    expect(await anexarAoEnvio(ESC, "envio_ordem_000001", 3 * MB, b, 10 * MB)).toBe(5 * MB);

    const pronto = await concluirEnvio(ESC, "envio_ordem_000001", "arquivo_ordem");
    const inteiro = Buffer.concat([a, b]);
    expect(pronto.tamanhoBytes).toBe(5 * MB);
    expect(pronto.hash).toBe(createHash("sha256").update(inteiro).digest("hex"));
    expect((await readFile(caminhoDo(ESC, "arquivo_ordem"))).equals(inteiro)).toBe(true);
    // O envio deixou de existir: virou o arquivo.
    expect(await tamanhoDoEnvio(ESC, "envio_ordem_000001")).toBe(0);
  });

  it("pedaco reenviado (resposta perdida) não duplica o áudio", async () => {
    const a = pedaco(MB, 7);
    await anexarAoEnvio(ESC, "envio_reenvio_0001", 0, a, 10 * MB);
    expect(await anexarAoEnvio(ESC, "envio_reenvio_0001", 0, a, 10 * MB)).toBe(MB);
    expect(await tamanhoDoEnvio(ESC, "envio_reenvio_0001")).toBe(MB);
  });

  it("pedaco fora de ordem e recusado com 409 e não altera o envio", async () => {
    await anexarAoEnvio(ESC, "envio_fora_000001", 0, pedaco(MB, 1), 10 * MB);
    const erro = await anexarAoEnvio(ESC, "envio_fora_000001", 5 * MB, pedaco(MB, 2), 10 * MB).catch(
      (e) => e,
    );
    expect(erro).toBeInstanceOf(EnvioInvalido);
    expect(erro.status).toBe(409);
    expect(await tamanhoDoEnvio(ESC, "envio_fora_000001")).toBe(MB);
  });

  it("passar do limite apaga o envio (413): nada fica ocupando o disco", async () => {
    await anexarAoEnvio(ESC, "envio_grande_0001", 0, pedaco(2 * MB, 1), 3 * MB);
    const erro = await anexarAoEnvio(ESC, "envio_grande_0001", 2 * MB, pedaco(2 * MB, 1), 3 * MB).catch(
      (e) => e,
    );
    expect(erro).toBeInstanceOf(EnvioInvalido);
    expect(erro.status).toBe(413);
    expect(await tamanhoDoEnvio(ESC, "envio_grande_0001")).toBe(0);
  });

  it("concluir envio vazio ou inexistente e recusado", async () => {
    const erro = await concluirEnvio(ESC, "envio_nao_existe_01", "arquivo_x").catch((e) => e);
    expect(erro).toBeInstanceOf(EnvioInvalido);
    expect(erro.status).toBe(404);
  });

  it("nome de envio com barra ou ponto não vira caminho", async () => {
    await expect(anexarAoEnvio(ESC, "../../etc/passwd", 0, pedaco(1, 1), MB)).rejects.toThrow();
  });

  it("descartar apaga o envio", async () => {
    await anexarAoEnvio(ESC, "envio_descarte_01", 0, pedaco(MB, 1), 10 * MB);
    await descartarEnvio(ESC, "envio_descarte_01");
    expect(await tamanhoDoEnvio(ESC, "envio_descarte_01")).toBe(0);
  });

  it("envio abandonado há mais de um dia e apagado; o recente fica", async () => {
    await anexarAoEnvio(ESC, "envio_velho_00001", 0, pedaco(MB, 1), 10 * MB);
    await anexarAoEnvio(ESC, "envio_novo_000001", 0, pedaco(MB, 1), 10 * MB);
    const doisDias = (Date.now() - 2 * 24 * 60 * 60 * 1000) / 1000;
    await utimes(join(raiz(), ESC, "_envios", "envio_velho_00001"), doisDias, doisDias);

    expect(await limparEnviosVelhos(ESC)).toBe(1);
    expect(await tamanhoDoEnvio(ESC, "envio_velho_00001")).toBe(0);
    expect(await tamanhoDoEnvio(ESC, "envio_novo_000001")).toBe(MB);
    // Escritorio sem nenhum envio: nada a fazer, sem erro.
    expect(await limparEnviosVelhos("escritorio_sem_envios")).toBe(0);
  });

  it("download le o arquivo do disco aos poucos, com o tamanho certo", async () => {
    await anexarAoEnvio(ESC, "envio_fluxo_00001", 0, pedaco(MB + 5, 9), 10 * MB);
    await concluirEnvio(ESC, "envio_fluxo_00001", "arquivo_fluxo");
    const aberto = await fluxoDoDisco(ESC, "arquivo_fluxo");
    expect(aberto?.tamanho).toBe(MB + 5);
    const lido = Buffer.from(await new Response(aberto!.fluxo).arrayBuffer());
    expect(lido.equals(pedaco(MB + 5, 9))).toBe(true);
  });
});
