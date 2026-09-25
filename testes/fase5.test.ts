// Fase 5: aceite dos documentos, backup com restauracao testada de verdade,
// encerramento e purga depois do prazo de retencao.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comEscritorio,
  prismaPlataforma,
  semEscritorio,
} from "../src/lib/prisma";
import {
  gerarBackup,
  restaurarBackup,
  FORMATO_DO_BACKUP,
} from "../src/lib/backup";
import {
  documentosPendentes,
  ipDaRequisicao,
  registrarAceite,
} from "../src/lib/aceite";
import {
  DOCUMENTOS,
  PRAZO_DE_RETENCAO_DIAS,
  VERSAO_DOS_DOCUMENTOS,
} from "../src/lib/juridico";
import {
  encerrarEscritorio,
  podePurgar,
  purgarEncerrados,
  reativarEscritorio,
} from "../src/lib/encerramento";
import { salvarIntegracao, obterIntegracao } from "../src/lib/integracao";
import { gerarHash } from "../src/lib/senhas";
import {
  limparLimitesVencidos,
  registrarTentativa,
  zerarLimites,
} from "../src/lib/limite";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;
const DIA = 24 * 60 * 60 * 1000;

describe("prazo de retencao (puro)", () => {
  it("so purga depois do prazo, e so uma vez", () => {
    const agora = new Date("2026-12-01T12:00:00Z");
    const recem = new Date("2026-11-30T12:00:00Z");
    const antigo = new Date(
      agora.getTime() - (PRAZO_DE_RETENCAO_DIAS + 1) * DIA,
    );

    expect(podePurgar(null, null, agora)).toBe(false);
    expect(podePurgar(recem, null, agora)).toBe(false);
    expect(podePurgar(antigo, null, agora)).toBe(true);
    // Ja purgado nao purga de novo.
    expect(podePurgar(antigo, new Date(), agora)).toBe(false);
  });
});

describe("ip da requisicao", () => {
  it("le o primeiro endereco do x-forwarded-for", () => {
    const req = new Request("http://local", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    expect(ipDaRequisicao(req)).toBe("203.0.113.9");
  });

  it("devolve null quando nao ha cabecalho", () => {
    expect(ipDaRequisicao(new Request("http://local"))).toBeNull();
  });
});

d("limite de tentativas", () => {
  it("libera ate o maximo e bloqueia depois, dentro da janela", async () => {
    await zerarLimites();
    for (let i = 0; i < 3; i += 1) {
      expect((await registrarTentativa("ip:1", 3, 60)).permitido).toBe(true);
    }
    const bloqueado = await registrarTentativa("ip:1", 3, 60);
    expect(bloqueado.permitido).toBe(false);
    expect(bloqueado.esperarSegundos).toBeGreaterThan(0);
  });

  it("chaves diferentes nao se atrapalham", async () => {
    await zerarLimites();
    expect((await registrarTentativa("ip:a", 1, 60)).permitido).toBe(true);
    expect((await registrarTentativa("ip:a", 1, 60)).permitido).toBe(false);
    expect((await registrarTentativa("ip:b", 1, 60)).permitido).toBe(true);
  });

  it("janela vencida recomeca a contagem", async () => {
    await zerarLimites();
    // Janela de 1 segundo: espera de verdade, sem relogio falso.
    expect((await registrarTentativa("ip:c", 1, 1)).permitido).toBe(true);
    expect((await registrarTentativa("ip:c", 1, 1)).permitido).toBe(false);
    await new Promise((r) => setTimeout(r, 1_200));
    expect((await registrarTentativa("ip:c", 1, 1)).permitido).toBe(true);
  });

  it("a contagem e compartilhada entre chamadas simultaneas", async () => {
    await zerarLimites();
    // Dez requisicoes ao mesmo tempo, limite 4: exatamente 4 passam.
    const resultados = await Promise.all(
      Array.from({ length: 10 }, () => registrarTentativa("ip:d", 4, 60)),
    );
    expect(resultados.filter((r) => r.permitido)).toHaveLength(4);
  });

  it("limpar remove so as janelas vencidas", async () => {
    await zerarLimites();
    await registrarTentativa("ip:vencida", 5, 1);
    await registrarTentativa("ip:viva", 5, 600);
    await new Promise((r) => setTimeout(r, 1_200));

    expect(await limparLimitesVencidos()).toBe(1);
  });
});

let original = "";
let restaurado = "";
const marca = Date.now();

d("backup e restauracao", () => {
  beforeAll(async () => {
    process.env.SEGREDO_CHAVE ??= Buffer.alloc(32, 7).toString("base64");

    const e = await prismaPlataforma().escritorio.create({
      data: { slug: `f5-${marca}`, nome: "Escritorio F5", faixa: "ATE_10" },
    });
    original = e.id;

    await comEscritorio(original, async (db) => {
      await db.usuario.create({
        data: semEscritorio({
          nome: "Titular F5",
          email: "titular@f5.adv.br",
          senhaHash: await gerarHash("senha-de-teste-1234"),
          papel: "ADMIN",
          advogado: true,
        }),
      });
      const cliente = await db.cliente.create({
        data: semEscritorio({ nome: "Cliente F5", documento: "12345678900" }),
      });
      const processo = await db.processo.create({
        data: semEscritorio({
          numero: `0001-${marca}`,
          clienteId: cliente.id,
          tribunal: "TJSP",
        }),
      });
      await db.compromisso.create({
        data: semEscritorio({
          titulo: "Audiencia F5",
          inicio: new Date(Date.now() + DIA),
          processoId: processo.id,
        }),
      });
      await db.lancamento.create({
        data: semEscritorio({
          descricao: "Honorarios",
          valorCentavos: 150000,
          tipo: "RECEITA",
          competencia: "2026-09",
        }),
      });
      await db.moduloContratado.create({
        data: semEscritorio({ modulo: "FINANCEIRO" }),
      });
    });

    await salvarIntegracao(
      original,
      "ASAAS",
      { chave: "chave-secreta-do-asaas" },
      "OK",
    );
  });

  afterAll(async () => {
    for (const id of [original, restaurado]) {
      if (id)
        await prismaPlataforma()
          .escritorio.delete({ where: { id } })
          .catch(() => {});
    }
    await prismaPlataforma().$disconnect();
  });

  it("o backup leva tudo do escritorio", async () => {
    const backup = await gerarBackup(original);
    expect(backup.formato).toBe(FORMATO_DO_BACKUP);
    expect(backup.tabelas.cliente).toHaveLength(1);
    expect(backup.tabelas.processo).toHaveLength(1);
    expect(backup.tabelas.compromisso).toHaveLength(1);
    expect(backup.tabelas.lancamento).toHaveLength(1);
    expect(backup.tabelas.integracao).toHaveLength(1);
  });

  it("a credencial vai no backup cifrada, nunca em texto puro", async () => {
    const backup = await gerarBackup(original);
    expect(JSON.stringify(backup)).not.toContain("chave-secreta-do-asaas");
  });

  it("restaura em um escritorio novo, registro a registro", async () => {
    const backup = await gerarBackup(original);
    const resultado = await restaurarBackup(backup, `f5r-${marca}`);
    restaurado = resultado.escritorioId;

    expect(resultado.registros).toMatchObject({
      usuario: 1,
      cliente: 1,
      processo: 1,
      compromisso: 1,
      lancamento: 1,
      integracao: 1,
    });

    const conferencia = await comEscritorio(restaurado, async (db) => ({
      cliente: await db.cliente.findFirstOrThrow(),
      processo: await db.processo.findFirstOrThrow(),
      compromisso: await db.compromisso.findFirstOrThrow(),
    }));
    expect(conferencia.cliente.nome).toBe("Cliente F5");
    expect(conferencia.processo.numero).toBe(`0001-${marca}`);
    // O vinculo processo -> cliente sobrevive a restauracao.
    expect(conferencia.processo.clienteId).toBe(conferencia.cliente.id);
    expect(conferencia.compromisso.processoId).toBe(conferencia.processo.id);
  });

  it("a credencial restaurada ainda decifra", async () => {
    const dados = await obterIntegracao<{ chave: string }>(restaurado, "ASAAS");
    expect(dados.chave).toBe("chave-secreta-do-asaas");
  });

  it("o escritorio restaurado nasce SUSPENSO", async () => {
    const e = await prismaPlataforma().escritorio.findUniqueOrThrow({
      where: { id: restaurado },
    });
    expect(e.status).toBe("SUSPENSO");
  });

  it("o original continua intacto depois da restauracao", async () => {
    const quantos = await comEscritorio(original, (db) => db.cliente.count());
    expect(quantos).toBe(1);
  });

  it("recusa backup de formato desconhecido", async () => {
    const backup = await gerarBackup(original);
    await expect(
      restaurarBackup({ ...backup, formato: 99 }, "nao-vai-existir"),
    ).rejects.toThrow(/Formato de backup/);
  });
});

d("aceite dos documentos", () => {
  let escritorio = "";

  beforeAll(async () => {
    const e = await prismaPlataforma().escritorio.create({
      data: { slug: `f5a-${marca}`, nome: "Escritorio do Aceite" },
    });
    escritorio = e.id;
  });

  afterAll(async () => {
    if (escritorio) {
      await prismaPlataforma()
        .escritorio.delete({ where: { id: escritorio } })
        .catch(() => {});
    }
  });

  it("antes de aceitar, todos os documentos estao pendentes", async () => {
    await expect(documentosPendentes(escritorio)).resolves.toHaveLength(
      DOCUMENTOS.length,
    );
  });

  it("grava um aceite por documento, com versao e rastro", async () => {
    const quantos = await registrarAceite(escritorio, {
      nome: "Dra. Fulana",
      email: "Fulana@Exemplo.adv.br",
      ip: "203.0.113.9",
      navegador: "Mozilla/5.0",
    });
    expect(quantos).toBe(DOCUMENTOS.length);

    const aceites = await comEscritorio(escritorio, (db) =>
      db.aceiteDeTermos.findMany(),
    );
    expect(aceites.every((a) => a.versao === VERSAO_DOS_DOCUMENTOS)).toBe(true);
    expect(aceites[0]?.usuarioEmail).toBe("fulana@exemplo.adv.br");
    expect(aceites[0]?.ip).toBe("203.0.113.9");

    await expect(documentosPendentes(escritorio)).resolves.toHaveLength(0);
  });
});

d("encerramento e purga", () => {
  let escritorio = "";

  beforeAll(async () => {
    const e = await prismaPlataforma().escritorio.create({
      data: { slug: `f5p-${marca}`, nome: "Escritorio que Encerra" },
    });
    escritorio = e.id;
    await comEscritorio(escritorio, (db) =>
      db.cliente.create({
        data: semEscritorio({ nome: "Cliente que sera apagado" }),
      }),
    );
    // Fatura e aceite existem para a purga ter o que NAO apagar.
    await prismaPlataforma().fatura.create({
      data: {
        escritorioId: escritorio,
        competencia: "2026-08",
        valorCentavos: 29900,
        vencimento: new Date("2026-08-10"),
        status: "PAGA",
        pagoEm: new Date("2026-08-09"),
      },
    });
    await registrarAceite(escritorio, {
      nome: "Dr. Encerrado",
      email: "encerrado@exemplo.adv.br",
      ip: null,
      navegador: null,
    });
  });

  afterAll(async () => {
    if (escritorio) {
      await prismaPlataforma()
        .escritorio.delete({ where: { id: escritorio } })
        .catch(() => {});
    }
  });

  it("encerrar muda o status e comeca a contar o prazo", async () => {
    const e = await encerrarEscritorio(escritorio);
    expect(e.status).toBe("ENCERRADO");
    expect(e.encerradoEm).not.toBeNull();
  });

  it("dentro do prazo, a purga nao toca nos dados", async () => {
    const resultado = await purgarEncerrados();
    expect(resultado.escritorios).not.toContain(`f5p-${marca}`);

    const quantos = await comEscritorio(escritorio, (db) => db.cliente.count());
    expect(quantos).toBe(1);
  });

  it("reativar dentro do prazo desfaz o encerramento", async () => {
    const e = await reativarEscritorio(escritorio);
    expect(e.status).toBe("ATIVO");
    expect(e.encerradoEm).toBeNull();
  });

  it("passado o prazo, apaga os dados e guarda o registro da purga", async () => {
    await prismaPlataforma().escritorio.update({
      where: { id: escritorio },
      data: {
        status: "ENCERRADO",
        encerradoEm: new Date(Date.now() - (PRAZO_DE_RETENCAO_DIAS + 1) * DIA),
      },
    });

    const resultado = await purgarEncerrados();
    expect(resultado.escritorios).toContain(`f5p-${marca}`);

    const sobrou = await prismaPlataforma().cliente.count({
      where: { escritorioId: escritorio },
    });
    expect(sobrou).toBe(0);

    const casca = await prismaPlataforma().escritorio.findUniqueOrThrow({
      where: { id: escritorio },
    });
    expect(casca.purgadoEm).not.toBeNull();
  });

  it("fatura e aceite sobrevivem a purga — obrigacao propria da plataforma", async () => {
    // A purga ja rodou no caso anterior. Registro fiscal e prova de contrato
    // ficam; e o que o acordo de LGPD promete.
    await expect(
      prismaPlataforma().fatura.count({ where: { escritorioId: escritorio } }),
    ).resolves.toBe(1);
    await expect(
      prismaPlataforma().aceiteDeTermos.count({
        where: { escritorioId: escritorio },
      }),
    ).resolves.toBe(DOCUMENTOS.length);
  });

  it("os dados do escritorio, esses foram mesmo embora", async () => {
    const sobrou = await prismaPlataforma().$transaction([
      prismaPlataforma().cliente.count({ where: { escritorioId: escritorio } }),
      prismaPlataforma().usuario.count({ where: { escritorioId: escritorio } }),
      prismaPlataforma().integracao.count({
        where: { escritorioId: escritorio },
      }),
      prismaPlataforma().moduloContratado.count({
        where: { escritorioId: escritorio },
      }),
    ]);
    expect(sobrou).toEqual([0, 0, 0, 0]);
  });

  it("nao purga duas vezes o mesmo escritorio", async () => {
    const resultado = await purgarEncerrados();
    expect(resultado.escritorios).not.toContain(`f5p-${marca}`);
  });
});
