// Fase 2: modulo contratado, limite da faixa, medicao e fila.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { exigirModulo, moduloAtivo, modulosAtivos, ModuloNaoContratado } from "../src/lib/modulos";
import { exigirVagaNaFaixa, FaixaEsgotada, usoDaFaixa } from "../src/lib/faixas";
import { competenciaDe, consumoDoMes, definirConsumo, registrarConsumo } from "../src/lib/consumo";
import { concluir, enfileirar, falhar, reclamar, destravar } from "../src/lib/fila";
import { espalhar, EXECUTORES } from "../src/lib/trabalhos";
import { gerarHash } from "../src/lib/senhas";
import { paraCentavos } from "../src/lib/dinheiro";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

let alfa = "";
let beta = "";
const marca = Date.now();

async function criarUsuario(escritorioId: string, email: string, advogado: boolean) {
  return comEscritorio(escritorioId, async (db) =>
    db.usuario.create({
      data: semEscritorio({
        nome: email,
        email,
        senhaHash: await gerarHash("senha-de-teste-1234"),
        papel: advogado ? "ADVOGADO" : "USUARIO",
        advogado,
      }),
    })
  );
}

d("fase 2", () => {
  beforeAll(async () => {
    const a = await prismaPlataforma().escritorio.create({
      data: { slug: `f2a-${marca}`, nome: "Alfa F2", faixa: "ATE_3" },
    });
    const b = await prismaPlataforma().escritorio.create({
      data: { slug: `f2b-${marca}`, nome: "Beta F2", faixa: "ATE_10" },
    });
    alfa = a.id;
    beta = b.id;
  });

  afterAll(async () => {
    for (const id of [alfa, beta]) {
      if (id) await prismaPlataforma().escritorio.delete({ where: { id } }).catch(() => {});
    }
    await prismaPlataforma().$disconnect();
  });

  describe("modulo contratado", () => {
    it("o nucleo vale sempre, sem contrato", async () => {
      await expect(moduloAtivo(alfa, "NUCLEO")).resolves.toBe(true);
      await expect(modulosAtivos(alfa)).resolves.toContain("NUCLEO");
    });

    it("modulo nao contratado bloqueia com 403", async () => {
      await expect(moduloAtivo(alfa, "FINANCEIRO")).resolves.toBe(false);
      await expect(exigirModulo(alfa, "FINANCEIRO")).rejects.toBeInstanceOf(ModuloNaoContratado);
      await expect(exigirModulo(alfa, "FINANCEIRO")).rejects.toMatchObject({ status: 403 });
    });

    it("contratar libera so para quem contratou", async () => {
      await comEscritorio(alfa, (db) =>
        db.moduloContratado.create({ data: semEscritorio({ modulo: "FINANCEIRO" }) })
      );
      await expect(moduloAtivo(alfa, "FINANCEIRO")).resolves.toBe(true);
      await expect(moduloAtivo(beta, "FINANCEIRO")).resolves.toBe(false);
    });

    it("desligar o modulo volta a bloquear", async () => {
      await comEscritorio(alfa, (db) =>
        db.moduloContratado.update({
          where: { escritorioId_modulo: { escritorioId: alfa, modulo: "FINANCEIRO" } },
          data: { ativo: false },
        })
      );
      await expect(moduloAtivo(alfa, "FINANCEIRO")).resolves.toBe(false);

      await comEscritorio(alfa, (db) =>
        db.moduloContratado.update({
          where: { escritorioId_modulo: { escritorioId: alfa, modulo: "FINANCEIRO" } },
          data: { ativo: true },
        })
      );
    });
  });

  describe("limite da faixa", () => {
    it("conta so usuario ativo e respeita o limite da faixa", async () => {
      // Alfa e ATE_3: tres advogados cabem, o quarto nao.
      for (let i = 0; i < 3; i += 1) {
        await exigirVagaNaFaixa(alfa, true);
        await criarUsuario(alfa, `adv${i}-${marca}@alfa.adv.br`, true);
      }

      const uso = await usoDaFaixa(alfa);
      expect(uso.faixa).toBe("ATE_3");
      expect(uso.advogados).toEqual({ usados: 3, limite: 3 });

      await expect(exigirVagaNaFaixa(alfa, true)).rejects.toBeInstanceOf(FaixaEsgotada);
      // O limite de apoio e separado: ainda ha vaga la.
      await expect(exigirVagaNaFaixa(alfa, false)).resolves.toBeUndefined();
    });

    it("desativar um usuario devolve a vaga", async () => {
      const usuario = await comEscritorio(alfa, (db) =>
        db.usuario.findFirstOrThrow({ where: { advogado: true } })
      );
      await comEscritorio(alfa, (db) =>
        db.usuario.update({ where: { id: usuario.id }, data: { ativo: false } })
      );

      await expect(exigirVagaNaFaixa(alfa, true)).resolves.toBeUndefined();
      const uso = await usoDaFaixa(alfa);
      expect(uso.advogados.usados).toBe(2);
    });

    it("a faixa de um escritorio nao interfere na do outro", async () => {
      const usoBeta = await usoDaFaixa(beta);
      expect(usoBeta.faixa).toBe("ATE_10");
      expect(usoBeta.advogados).toEqual({ usados: 0, limite: 10 });
    });
  });

  describe("medicao de consumo", () => {
    it("registrar soma e definir substitui", async () => {
      await registrarConsumo(alfa, "WHATSAPP_MSG", 30);
      await registrarConsumo(alfa, "WHATSAPP_MSG", 12);
      await definirConsumo(alfa, "REGISTROS", 7);
      await definirConsumo(alfa, "REGISTROS", 9);

      const linhas = await consumoDoMes(alfa);
      const mapa = new Map(linhas.map((l) => [l.metrica, l.quantidade]));
      expect(mapa.get("WHATSAPP_MSG")).toBe(42);
      expect(mapa.get("REGISTROS")).toBe(9);
    });

    it("excedente sai da franquia do modulo contratado", async () => {
      await comEscritorio(alfa, (db) =>
        db.moduloContratado.create({ data: semEscritorio({ modulo: "WHATSAPP", franquia: 40 }) })
      );

      const linha = (await consumoDoMes(alfa)).find((l) => l.metrica === "WHATSAPP_MSG");
      expect(linha).toMatchObject({ quantidade: 42, franquia: 40, excedente: 2 });

      // Metrica do nucleo nao tem franquia, logo nunca tem excedente.
      const registros = (await consumoDoMes(alfa)).find((l) => l.metrica === "REGISTROS");
      expect(registros).toMatchObject({ franquia: null, excedente: 0 });
    });

    it("consumo de um escritorio nao aparece no outro", async () => {
      await expect(consumoDoMes(beta)).resolves.toHaveLength(0);
    });
  });

  describe("fila de trabalho", () => {
    beforeAll(async () => {
      // A fila e global: reclamar() nao filtra por escritorio, de proposito.
      // Limpar aqui e o que torna a ordem previsivel — em producao o que
      // sobra de outro escritorio e justamente o que deve continuar la.
      await prismaPlataforma().trabalho.deleteMany({});
    });

    it("um trabalho em execucao por escritorio", async () => {
      await enfileirar("APURAR_CONSUMO", alfa);
      await enfileirar("APURAR_CONSUMO", alfa);
      await enfileirar("APURAR_CONSUMO", beta);

      const primeiro = await reclamar();
      const segundo = await reclamar();
      expect(primeiro?.escritorioId).toBe(alfa);
      // O segundo de alfa esta travado; vem o de beta.
      expect(segundo?.escritorioId).toBe(beta);

      // Nada mais reclamavel enquanto os dois rodam.
      await expect(reclamar()).resolves.toBeNull();

      await concluir(primeiro!.id);
      const terceiro = await reclamar();
      expect(terceiro?.escritorioId).toBe(alfa);
      await concluir(terceiro!.id);
      await concluir(segundo!.id);
    });

    it("o executor roda dentro do escritorio do trabalho", async () => {
      await EXECUTORES.APURAR_CONSUMO({ escritorioId: beta, dados: {} });
      const linhas = await consumoDoMes(beta);
      const mapa = new Map(linhas.map((l) => [l.metrica, l.quantidade]));
      expect(mapa.get("REGISTROS")).toBe(0);
      expect(mapa.get("USUARIOS_ATIVOS")).toBe(0);
    });

    it("falha volta para a fila e para em FALHOU no limite", async () => {
      const id = await enfileirar("TIPO_INEXISTENTE", alfa);
      const trabalho = await reclamar();
      expect(trabalho?.id).toBe(id);

      await falhar({ ...trabalho!, tentativas: 1 }, new Error("primeira falha"));
      let estado = await prismaPlataforma().trabalho.findUniqueOrThrow({ where: { id } });
      expect(estado.estado).toBe("PENDENTE");
      expect(estado.erro).toBe("primeira falha");

      await falhar({ ...trabalho!, tentativas: 3, maxTentativas: 3 }, new Error("ultima falha"));
      estado = await prismaPlataforma().trabalho.findUniqueOrThrow({ where: { id } });
      expect(estado.estado).toBe("FALHOU");
    });

    it("trabalho preso em execucao volta para a fila", async () => {
      const id = await enfileirar("APURAR_CONSUMO", beta);
      await reclamar();
      await prismaPlataforma().trabalho.update({
        where: { id },
        data: { estado: "EXECUTANDO", iniciadoEm: new Date(Date.now() - 60 * 60_000) },
      });

      expect(await destravar(15)).toBeGreaterThanOrEqual(1);
      const estado = await prismaPlataforma().trabalho.findUniqueOrThrow({ where: { id } });
      expect(estado.estado).toBe("PENDENTE");
    });

    it("espalhar agenda um trabalho por escritorio que pode receber", async () => {
      await prismaPlataforma().trabalho.deleteMany({ where: { escritorioId: { in: [alfa, beta] } } });
      const agendados = await espalhar("APURAR_CONSUMO");
      expect(agendados).toBeGreaterThanOrEqual(2);

      const deAlfa = await prismaPlataforma().trabalho.count({
        where: { escritorioId: alfa, estado: "PENDENTE" },
      });
      expect(deAlfa).toBe(1);
    });

    it("escritorio encerrado fica de fora do espalhamento", async () => {
      await prismaPlataforma().escritorio.update({
        where: { id: beta },
        data: { status: "ENCERRADO" },
      });
      await prismaPlataforma().trabalho.deleteMany({ where: { escritorioId: beta } });

      await espalhar("APURAR_CONSUMO");
      const deBeta = await prismaPlataforma().trabalho.count({ where: { escritorioId: beta } });
      expect(deBeta).toBe(0);

      await prismaPlataforma().escritorio.update({ where: { id: beta }, data: { status: "TESTE" } });
    });
  });

  describe("valor em centavos", () => {
    it("aceita virgula, ponto e R$", () => {
      expect(paraCentavos("1.234,56")).toBe(123456);
      expect(paraCentavos("1234.56")).toBe(123456);
      expect(paraCentavos("R$ 10")).toBe(1000);
      expect(paraCentavos("0,05")).toBe(5);
    });

    it("recusa o que nao e valor", () => {
      expect(paraCentavos("abc")).toBeNull();
      expect(paraCentavos("-5")).toBeNull();
    });
  });

  it("a competencia segue o formato aaaa-mm", () => {
    expect(competenciaDe(new Date(Date.UTC(2026, 8, 17)))).toBe("2026-09");
    expect(competenciaDe(new Date(Date.UTC(2026, 11, 1)))).toBe("2026-12");
  });
});
