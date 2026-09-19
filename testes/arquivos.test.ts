// Modulo NUVEM: os documentos do escritorio.
//
// O que se prova aqui e o que protege o escritorio: tipo que entra, tamanho,
// cota, caminho no disco que nao aceita nome vindo do usuario, e que arquivo
// de um escritorio nao se le do outro nem pelo id.
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { consumoDoMes } from "../src/lib/consumo";
import { purgarEncerrados } from "../src/lib/encerramento";
import { caminhoDo, existe, raiz } from "../src/lib/armazenamento";
import {
  apagarArquivo,
  ArquivoNaoEncontrado,
  ArquivoRecusado,
  emMb,
  espacoDoEscritorio,
  EspacoEsgotado,
  extensaoDe,
  guardarArquivo,
  lerArquivo,
  nomeLimpo,
  TAMANHO_MAXIMO_MB,
  tipoConfere,
} from "../src/lib/arquivos";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;
const DIA = 24 * 60 * 60 * 1000;

describe("regras do arquivo, antes de tocar em disco", () => {
  it("aceita so tipo da lista, e com a extensao batendo", () => {
    expect(tipoConfere("application/pdf", "peticao.pdf")).toBe(true);
    expect(tipoConfere("image/jpeg", "foto.JPG")).toBe(true);
    expect(tipoConfere("application/pdf", "peticao.exe")).toBe(false);
    expect(tipoConfere("application/x-msdownload", "virus.exe")).toBe(false);
    expect(tipoConfere("text/html", "pagina.html")).toBe(false);
    expect(tipoConfere("", "sem-tipo.pdf")).toBe(false);
  });

  it("nome que volta para o navegador nao carrega caminho nem aspas", () => {
    expect(nomeLimpo("../../etc/passwd")).toBe("passwd");
    expect(nomeLimpo('peticao".pdf')).toBe("peticao.pdf");
    expect(nomeLimpo("C:\\docs\\peca.docx")).toBe("peca.docx");
    expect(nomeLimpo("   ")).toBe("arquivo");
  });

  it("extensao sai em minuscula", () => {
    expect(extensaoDe("PECA.DOCX")).toBe("docx");
    expect(extensaoDe("sem-extensao")).toBe("sem-extensao");
  });

  it("megabyte e arredondado para cima: arquivo de 1 byte ocupa 1 MB no retrato", () => {
    expect(emMb(1)).toBe(1);
    expect(emMb(1024 * 1024)).toBe(1);
    expect(emMb(1024 * 1024 + 1)).toBe(2);
    expect(emMb(0)).toBe(0);
  });

  it("caminho no disco recusa identificador que nao seja nosso", () => {
    expect(() => caminhoDo("../outro", "abc")).toThrow();
    expect(() => caminhoDo("esc", "../../etc/passwd")).toThrow();
    expect(() => caminhoDo("esc", "a/b")).toThrow();
    expect(caminhoDo("esc123", "arq456")).toContain("esc123");
  });
});

const marca = Date.now();
let alfa = "";
let beta = "";
let processoAlfa = "";
let usuarioAlfa = "";
let usuarioBeta = "";

const pdf = (texto: string) => Buffer.from(`%PDF-1.4\n${texto}`);

d("arquivos por escritorio", () => {
  beforeAll(async () => {
    // Disco de teste proprio: nada escrito fora dele.
    process.env.RAIZ_ARQUIVOS = await mkdtemp(join(tmpdir(), "birdjud-arquivos-"));

    const a = await prismaPlataforma().escritorio.create({
      data: { slug: `arq-a-${marca}`, nome: "Alfa Nuvem" },
    });
    const b = await prismaPlataforma().escritorio.create({
      data: { slug: `arq-b-${marca}`, nome: "Beta Nuvem" },
    });
    alfa = a.id;
    beta = b.id;

    for (const id of [alfa, beta]) {
      await comEscritorio(id, (db) =>
        db.moduloContratado.create({
          data: semEscritorio({ modulo: "NUVEM", ativo: true, franquia: 10 }),
        })
      );
    }

    const donos = await Promise.all(
      [alfa, beta].map((id) =>
        comEscritorio(id, (db) =>
          db.usuario.create({
            data: semEscritorio({
              nome: "Quem sobe",
              email: `nuvem-${id}@teste.br`,
              senhaHash: "x",
              papel: "ADMIN",
            }),
          })
        )
      )
    );
    usuarioAlfa = donos[0].id;
    usuarioBeta = donos[1].id;
    const processo = await comEscritorio(alfa, (db) =>
      db.processo.create({ data: semEscritorio({ numero: "00012345620268260100" }) })
    );
    processoAlfa = processo.id;
  });

  afterAll(async () => {
    for (const id of [alfa, beta]) {
      if (id) await prismaPlataforma().escritorio.delete({ where: { id } }).catch(() => {});
    }
    await prismaPlataforma().$disconnect();
    delete process.env.RAIZ_ARQUIVOS;
  });

  it("guarda o arquivo, vincula ao processo e le de volta igual", async () => {
    const conteudo = pdf("peticao inicial");
    const { id } = await guardarArquivo(alfa, {
      nome: "inicial.pdf",
      tipo: "application/pdf",
      conteudo,
      usuarioId: usuarioAlfa,
      processoId: processoAlfa,
    });

    const lido = await lerArquivo(alfa, id);
    expect(lido.conteudo.equals(conteudo)).toBe(true);
    expect(lido.nome).toBe("inicial.pdf");

    const linha = await comEscritorio(alfa, (db) => db.arquivo.findUnique({ where: { id } }));
    expect(linha?.processoId).toBe(processoAlfa);
    expect(linha?.tamanhoBytes).toBe(conteudo.byteLength);
    expect(linha?.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("o byte fica em caminho nosso, nao no nome que o usuario mandou", async () => {
    const { id } = await guardarArquivo(alfa, {
      nome: "../../fuga.pdf",
      tipo: "application/pdf",
      conteudo: pdf("tentativa"),
      usuarioId: usuarioAlfa,
    });

    expect(await existe(alfa, id)).toBe(true);
    const naPasta = await readdir(join(raiz(), alfa));
    expect(naPasta).toContain(id);
    expect(naPasta.some((n) => n.includes("fuga"))).toBe(false);

    const linha = await comEscritorio(alfa, (db) => db.arquivo.findUnique({ where: { id } }));
    expect(linha?.nome).toBe("fuga.pdf");
  });

  it("recusa tipo fora da lista e arquivo vazio, sem gravar linha nenhuma", async () => {
    const antes = await comEscritorio(alfa, (db) => db.arquivo.count());

    await expect(
      guardarArquivo(alfa, {
        nome: "script.html",
        tipo: "text/html",
        conteudo: Buffer.from("<script>alert(1)</script>"),
        usuarioId: usuarioAlfa,
      })
    ).rejects.toBeInstanceOf(ArquivoRecusado);

    await expect(
      guardarArquivo(alfa, {
        nome: "vazio.pdf",
        tipo: "application/pdf",
        conteudo: Buffer.alloc(0),
        usuarioId: usuarioAlfa,
      })
    ).rejects.toBeInstanceOf(ArquivoRecusado);

    expect(await comEscritorio(alfa, (db) => db.arquivo.count())).toBe(antes);
  });

  it("recusa arquivo maior que o teto por arquivo", async () => {
    const grande = Buffer.alloc((TAMANHO_MAXIMO_MB + 1) * 1024 * 1024, 1);
    await expect(
      guardarArquivo(alfa, {
        nome: "grande.pdf",
        tipo: "application/pdf",
        conteudo: grande,
        usuarioId: usuarioAlfa,
      })
    ).rejects.toMatchObject({ status: 413 });
  });

  it("mede o espaco usado no consumo do mes", async () => {
    await guardarArquivo(alfa, {
      nome: "medicao.pdf",
      tipo: "application/pdf",
      conteudo: pdf("x"),
      usuarioId: usuarioAlfa,
    });

    const linha = (await consumoDoMes(alfa)).find((l) => l.metrica === "ARMAZENAMENTO_MB");
    const espaco = await espacoDoEscritorio(alfa);
    // Retrato, nao acumulo: o consumo e o espaco de agora, nao a soma do que
    // ja passou por aqui.
    expect(linha?.quantidade).toBe(espaco.usadoMb);
    expect(linha?.franquia).toBe(10);
  });

  it("apagar libera o espaco e some com o byte", async () => {
    const { id } = await guardarArquivo(alfa, {
      nome: "efemero.pdf",
      tipo: "application/pdf",
      conteudo: pdf("some depois"),
      usuarioId: usuarioAlfa,
    });
    expect(await existe(alfa, id)).toBe(true);

    await apagarArquivo(alfa, id);

    expect(await existe(alfa, id)).toBe(false);
    await expect(lerArquivo(alfa, id)).rejects.toBeInstanceOf(ArquivoNaoEncontrado);
  });

  it("barra no teto, e o teto e maior que a franquia", async () => {
    // Franquia de 10 MB, teto de 30 MB. Enche ate passar do teto.
    const doisMb = Buffer.alloc(2 * 1024 * 1024, 2);
    let recusou = false;
    for (let i = 0; i < 20; i += 1) {
      try {
        await guardarArquivo(beta, {
          nome: `lote-${i}.pdf`,
          tipo: "application/pdf",
          conteudo: doisMb,
          usuarioId: usuarioBeta,
        });
      } catch (erro) {
        expect(erro).toBeInstanceOf(EspacoEsgotado);
        recusou = true;
        break;
      }
    }

    const espaco = await espacoDoEscritorio(beta);
    expect(recusou).toBe(true);
    expect(espaco.usadoMb).toBeGreaterThan(espaco.franquiaMb);
    expect(espaco.usadoMb).toBeLessThanOrEqual(espaco.tetoMb);
  });

  it("arquivo de um escritorio nao se le do outro, nem sabendo o id", async () => {
    const { id } = await guardarArquivo(alfa, {
      nome: "so-do-alfa.pdf",
      tipo: "application/pdf",
      conteudo: pdf("segredo do alfa"),
      usuarioId: usuarioAlfa,
    });

    await expect(lerArquivo(beta, id)).rejects.toBeInstanceOf(ArquivoNaoEncontrado);
    await expect(apagarArquivo(beta, id)).rejects.toBeInstanceOf(ArquivoNaoEncontrado);
    // E continua inteiro para o dono.
    expect((await lerArquivo(alfa, id)).conteudo.toString()).toContain("segredo do alfa");
  });

  it("linha sem byte no disco responde como nao encontrado", async () => {
    // Acontece se alguem mexer no volume por fora. Melhor 404 do que 500.
    const orfao = await comEscritorio(alfa, (db) =>
      db.arquivo.create({
        data: semEscritorio({
          nome: "perdido.pdf",
          tipo: "application/pdf",
          tamanhoBytes: 10,
        }),
      })
    );
    await expect(lerArquivo(alfa, orfao.id)).rejects.toBeInstanceOf(ArquivoNaoEncontrado);
  });
});

d("purga leva os arquivos junto", () => {
  it("escritorio purgado nao deixa linha nem byte", async () => {
    process.env.RAIZ_ARQUIVOS ??= await mkdtemp(join(tmpdir(), "birdjud-purga-"));

    const alvo = await prismaPlataforma().escritorio.create({
      data: { slug: `arq-purga-${marca}`, nome: "Vai ser purgado" },
    });

    try {
      const dono = await comEscritorio(alvo.id, (db) =>
        db.usuario.create({
          data: semEscritorio({
            nome: "Quem sobe",
            email: `purga-${marca}@teste.br`,
            senhaHash: "x",
            papel: "ADMIN",
          }),
        })
      );
      const { id } = await guardarArquivo(alvo.id, {
        nome: "some.pdf",
        tipo: "application/pdf",
        conteudo: pdf("vai embora"),
        usuarioId: dono.id,
      });
      // Publicacao e analise de IA tambem precisam sair: antes desta correcao
      // elas sobreviviam a purga.
      await comEscritorio(alvo.id, async (db) => {
        await db.publicacao.create({
          data: semEscritorio({
            idExterno: `pub-${marca}`,
            texto: "Intimacao",
            dataDisponibilizacao: new Date(),
          }),
        });
        await db.analiseIA.create({
          data: semEscritorio({
            tipo: "ANALISE_PUBLICACAO",
            modelo: "modelo-de-teste",
            resultado: "resumo",
            tokensEntrada: 1,
            tokensSaida: 1,
          }),
        });
      });

      await prismaPlataforma().escritorio.update({
        where: { id: alvo.id },
        data: { status: "ENCERRADO", encerradoEm: new Date(Date.now() - 400 * DIA) },
      });

      const resultado = await purgarEncerrados();
      expect(resultado.escritorios).toContain(alvo.slug);

      expect(await existe(alvo.id, id)).toBe(false);
      const sobrou = await comEscritorio(alvo.id, async (db) => ({
        arquivos: await db.arquivo.count(),
        publicacoes: await db.publicacao.count(),
        analises: await db.analiseIA.count(),
      }));
      expect(sobrou).toEqual({ arquivos: 0, publicacoes: 0, analises: 0 });
    } finally {
      await prismaPlataforma().escritorio.delete({ where: { id: alvo.id } }).catch(() => {});
    }
  });
});
