// Codigo de atendimento, contra o golpe do falso advogado.
//
// O que estes testes protegem: o cliente. Cada um trava uma decisao de
// seguranca que nao pode ser desfeita por distracao — o reforco que nao leva
// codigo, o destino que so sai do cadastro, a promessa que o sistema cumpre.
import { SMTPServer } from "smtp-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as regra from "../src/lib/codigo-de-atendimento";
import {
  PALAVRAS,
  TOTAL_DE_AVISOS,
  anuncio,
  emailDeReforco,
  folhaDoCodigo,
  linkDoWhatsapp,
  montarVcard,
  nomeCurto,
  normalizarCodigo,
  primeiroAviso,
  reforco,
  regras,
  sortearCodigo,
} from "../src/lib/codigo-de-atendimento";
import { LIMITE_DO_CORPO, MODELOS, preencherModelo } from "../src/lib/modelos-whatsapp";
import { xmlDasLinhas, acrescentarAoCorpo, montarDocx, lerTextos, CAMINHO_DO_TEXTO } from "../src/lib/docx";
import { estruturaDoDocumento } from "../src/lib/modelos";
import { montarPdf } from "../src/lib/pdf";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { salvarIntegracao } from "../src/lib/integracao";
import {
  CodigoIndisponivel,
  continuarCampanha,
  enviarPrimeiroAviso,
  garantirCodigo,
  parametrosDoPrimeiroAviso,
  parametrosDoReforco,
  reenviarPorEmail,
  trocarCodigo,
} from "../src/lib/codigos-do-escritorio";
import { gerarPeca } from "../src/lib/modelos-do-escritorio";

const BANCA = { nome: "Prado & Moura Advogados", telefone: "(71) 3000-1122" };
const FORMATO = /^[A-Z]+ [1-9][0-9]$/;

describe("o código", () => {
  it("palavras sem acento, cedilha, hífen nem repetição", () => {
    expect(new Set(PALAVRAS).size).toBe(PALAVRAS.length);
    for (const p of PALAVRAS) expect(p, p).toMatch(/^[A-Z]+$/);
    expect(PALAVRAS.length).toBeGreaterThanOrEqual(120);
  });

  it("PALAVRA + número de 10 a 99: zero na frente se perde ao falar", () => {
    for (let i = 0; i < 500; i++) expect(sortearCodigo()).toMatch(FORMATO);
  });

  it("a mesma chave, escrita de qualquer jeito", () => {
    expect(normalizarCodigo("girassol-27")).toBe("GIRASSOL27");
    expect(normalizarCodigo(" Algodão 27 ")).toBe("ALGODAO27");
  });

  it("não existe função que confira código informado pelo cliente", () => {
    // Pedir o codigo ao cliente e o que o golpista faz. Se um dia aparecer
    // aqui um "conferir", "validar" ou "verificar", este teste para a mudanca.
    for (const nome of Object.keys(regra)) expect(nome).not.toMatch(/confer|valid|verific|checa|mesmoCodigo/i);
  });
});

describe("o que o cliente lê", () => {
  it("só o primeiro aviso leva o código; nenhum reforço leva", () => {
    expect(primeiroAviso("GIRASSOL 27", "maria da silva", BANCA).texto).toContain("GIRASSOL 27");
    for (let etapa = 2; etapa <= TOTAL_DE_AVISOS; etapa++) {
      const texto = [...reforco(etapa, BANCA), emailDeReforco(etapa, "Maria", BANCA).texto, parametrosDoReforco(etapa, "Maria", BANCA).join(" ")].join(" ");
      for (const palavra of PALAVRAS) expect(texto, `etapa ${etapa}`).not.toMatch(new RegExp(`\\b${palavra} \\d\\d\\b`));
    }
  });

  it("as regras dizem para onde ligar e não prometem o que o sistema não cumpre", () => {
    const texto = regras(BANCA).join(" ");
    expect(texto).toContain(BANCA.telefone);
    expect(texto).toContain("NUNCA diga o seu código");
    // O proprio sistema manda link de boleto e Pix do escritorio por mensagem:
    // prometer "nunca pedimos pagamento por mensagem" seria mentira.
    expect(texto).not.toMatch(/nunca pede (dinheiro|pagamento)[^.]*por mensagem/i);
    // E nao promete que o codigo nunca vem por mensagem: o escritorio o DIZ.
    expect(texto).not.toMatch(/única vez/i);
  });

  it("cada semana de reforço diz uma coisa diferente", () => {
    const semanas = [2, 3, 4, 5].map((e) => reforco(e, BANCA).join(" "));
    expect(new Set(semanas).size).toBe(4);
  });
});

describe("o botão de WhatsApp", () => {
  it("abre a conversa do telefone DO CADASTRO, com o código já escrito", () => {
    const link = linkDoWhatsapp({ nome: "MARIA DA SILVA", telefone: "(71) 99000-2211" }, "GIRASSOL 27", "Prado & Moura")!;
    expect(link.startsWith("https://wa.me/5571990002211?text=")).toBe(true);
    const texto = decodeURIComponent(link.split("text=")[1]);
    expect(texto).toBe("Olá, Maria. Aqui é do escritório Prado & Moura. O seu código de atendimento é GIRASSOL 27.");
    // A funcao nao tem parametro para outro numero.
    expect(linkDoWhatsapp.length).toBe(3);
  });

  it("empresa não tem primeiro nome, e “Escritório X” não repete a palavra", () => {
    const link = linkDoWhatsapp({ nome: "Construtora Aurora Ltda", telefone: "7130001122", documento: "11.222.333/0001-81" }, "UVA 10", "Escritório Modelo")!;
    expect(decodeURIComponent(link.split("text=")[1])).toBe("Olá. Aqui é do Escritório Modelo. O código de atendimento de Construtora Aurora Ltda é UVA 10.");
    expect(primeiroAviso("UVA 10", "Construtora Aurora Ltda", BANCA, true).texto.startsWith("Olá.\n")).toBe(true);
  });

  it("sem telefone que sirva, não há link", () => {
    expect(linkDoWhatsapp({ nome: "X", telefone: null }, "UVA 10", "E")).toBeNull();
    expect(linkDoWhatsapp({ nome: "X", telefone: "123" }, "UVA 10", "E")).toBeNull();
  });
});

describe("arquivo de contatos", () => {
  it("o código vai no nome; vírgula não parte o cartão; linhas em CRLF", () => {
    const { arquivo, quantos } = montarVcard(
      [
        { nome: "SILVA, MARIA; DA", telefone: "71 99000-2211", codigo: "GIRASSOL 27" },
        { nome: "Sem Telefone", telefone: null, codigo: "UVA 10" },
      ],
      false,
    );
    expect(quantos).toBe(1);
    expect(arquivo).toContain("FN:SILVA\\, MARIA\\; DA — GIRASSOL 27\r\n");
    expect(arquivo).toContain("TEL;TYPE=CELL:+5571990002211\r\n");
    expect(arquivo.split("\r\n").filter((l) => l === "BEGIN:VCARD")).toHaveLength(1);
    expect(arquivo.replace(/\r\n/g, "")).not.toContain("\n");
    expect(arquivo).not.toContain("UVA 10");
  });

  it("nome curto: primeiro e último, porque o WhatsApp corta o fim", () => {
    expect(nomeCurto("Maria Helena da Silva Santos")).toBe("Maria Santos");
    expect(nomeCurto("Maria Santos")).toBe("Maria Santos");
    expect(montarVcard([{ nome: "Maria Helena Santos", telefone: "71990002211", codigo: "UVA 10" }], true).arquivo).toContain("FN:Maria Santos — UVA 10");
  });
});

describe("os modelos da Meta", () => {
  const dois = [MODELOS.AVISO_DE_SEGURANCA, MODELOS.LEMBRETE_DE_SEGURANCA];

  it("o corpo FIXO não fala em código: a Meta recusa como mensagem de verificação", () => {
    for (const m of dois) expect(m.texto.toLowerCase(), m.nome).not.toMatch(/c[oó]digo/);
  });

  it("a mensagem preenchida cabe no limite, no pior caso", () => {
    const banca = { nome: "Escritório de Advocacia com Nome Muito Comprido e Associados Ltda", telefone: "(71) 99999-8888" };
    const maiorPalavra = [...PALAVRAS].sort((a, b) => b.length - a.length)[0];
    const nome = "Maximiliano-Bartolomeu de Albuquerque";
    const aviso = preencherModelo(MODELOS.AVISO_DE_SEGURANCA, parametrosDoPrimeiroAviso(`${maiorPalavra} 99`, nome, banca));
    expect(aviso.length).toBeLessThanOrEqual(LIMITE_DO_CORPO);
    expect(aviso).toContain(`${maiorPalavra} 99`);
    // Nome e escritorio podem ser cortados; o anuncio e as regras, nunca.
    const [, , oAnuncio, asRegras] = parametrosDoPrimeiroAviso(`${maiorPalavra} 99`, nome, banca);
    expect(oAnuncio).not.toContain("…");
    expect(asRegras).not.toContain("…");
    expect(asRegras).toContain("não mandamos o código a quem pede por mensagem.");
    for (let etapa = 2; etapa <= TOTAL_DE_AVISOS; etapa++) {
      const r = preencherModelo(MODELOS.LEMBRETE_DE_SEGURANCA, parametrosDoReforco(etapa, nome, banca));
      expect(r.length, `etapa ${etapa}`).toBeLessThanOrEqual(LIMITE_DO_CORPO);
      expect(parametrosDoReforco(etapa, nome, banca)[2], `etapa ${etapa}`).not.toContain("…");
    }
  });

  it("nenhuma variável leva quebra de linha", () => {
    for (const p of parametrosDoPrimeiroAviso("UVA 10", "Maria", BANCA)) expect(p).not.toMatch(/[\n\t]/);
  });
});

describe("a folha do código no contrato", () => {
  it("folha nova, código em letra grande, igual no Word e no PDF", async () => {
    const corpo = await montarDocx([{ texto: "CONTRATO", negrito: true, centro: true }, { texto: "Cláusula única." }]);
    const xml = (await lerTextos(corpo))[CAMINHO_DO_TEXTO];
    const comFolha = acrescentarAoCorpo(xml, xmlDasLinhas(folhaDoCodigo("GIRASSOL 27", "Maria da Silva", BANCA)));
    // As propriedades da secao continuam por ultimo: sem isso o Word recusa.
    expect(comFolha.indexOf("<w:sectPr")).toBeGreaterThan(comFolha.indexOf("GIRASSOL 27"));
    expect(comFolha).toContain("<w:pageBreakBefore/>");
    expect(comFolha).toContain('<w:sz w:val="56"/>');

    const linhas = estruturaDoDocumento(comFolha);
    const titulo = linhas.find((l) => l.pedacos.some((p) => p.texto === "ATENDIMENTO"))!;
    expect(titulo.novaPagina).toBe(true);
    const codigo = linhas.find((l) => l.pedacos.some((p) => p.texto === "GIRASSOL"))!;
    expect(codigo.corpo).toBe(28);

    const sem = await montarPdf(estruturaDoDocumento(xml));
    const com = await montarPdf(linhas);
    expect(sem.paginas).toBe(1);
    expect(com.paginas).toBe(2);
  });

  it("a folha traz as cinco regras e o telefone", () => {
    const texto = folhaDoCodigo("UVA 10", "Maria", BANCA).map((l) => l.texto).join("\n");
    for (const r of regras(BANCA)) expect(texto).toContain(r);
    expect(texto).not.toContain(anuncio("UVA 10"));
  });
});

// ---------------------------------------------------------------------------
// Com o banco
// ---------------------------------------------------------------------------

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

type Recebida = { para: string[]; corpo: string };
let smtp: SMTPServer;
let porta = 0;
let recebidas: Recebida[] = [];

// O corpo chega em quoted-printable: desfaz para procurar o texto.
const legivel = (corpo: string) =>
  Buffer.from(
    corpo.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
    "latin1",
  ).toString("utf8");

d("código de atendimento no banco", () => {
  let escritorio = "";
  let outro = "";
  let maria = "";
  let joao = "";
  let semContato = "";

  beforeAll(async () => {
    smtp = new SMTPServer({
      authOptional: true,
      disabledCommands: ["STARTTLS"],
      onAuth: (_c, _s, pronto) => pronto(null, { user: "x" }),
      onData(fluxo, sessao, pronto) {
        let corpo = "";
        fluxo.on("data", (p) => (corpo += p));
        fluxo.on("end", () => {
          recebidas.push({ para: sessao.envelope.rcptTo.map((r) => r.address), corpo });
          pronto();
        });
      },
    });
    await new Promise<void>((ok) => smtp.listen(0, "127.0.0.1", ok));
    porta = (smtp.server.address() as { port: number }).port;

    const marca = Date.now();
    escritorio = (await prismaPlataforma().escritorio.create({ data: { slug: `codigo-${marca}`, nome: "Banca do Código", telefoneAtendimento: "(71) 3000-1122" } })).id;
    outro = (await prismaPlataforma().escritorio.create({ data: { slug: `codigo-b-${marca}`, nome: "Outra Banca" } })).id;
    await comEscritorio(escritorio, async (db) => {
      maria = (await db.cliente.create({ data: semEscritorio({ nome: "Maria da Silva", email: "maria@cliente.test", telefone: "(71) 99000-2211" }) })).id;
      joao = (await db.cliente.create({ data: semEscritorio({ nome: "João Souza", email: "joao@cliente.test", notificarEmail: false }) })).id;
      semContato = (await db.cliente.create({ data: semEscritorio({ nome: "Sem Contato" }) })).id;
    });
    await salvarIntegracao(escritorio, "SMTP", { host: "127.0.0.1", porta: String(porta), usuario: "escritorio", senha: "segredo", remetente: "contato@banca.test" }, "OK");
    await prismaPlataforma().moduloContratado.create({ data: { escritorioId: escritorio, modulo: "EMAIL" } }).catch(() => {});
  });

  afterAll(async () => {
    for (const id of [escritorio, outro]) if (id) await prismaPlataforma().escritorio.delete({ where: { id } }).catch(() => {});
    await new Promise<void>((ok) => smtp.close(() => ok()));
    await prismaPlataforma().$disconnect();
  });

  it("um código por cliente, sempre o mesmo; cliente de outro escritório não ganha", async () => {
    const [a, b] = await Promise.all([garantirCodigo(escritorio, maria), garantirCodigo(escritorio, maria)]);
    expect(a).toMatch(FORMATO);
    expect(b).toBe(a);
    expect(await garantirCodigo(escritorio, maria)).toBe(a);
    // O cliente e do escritorio A: pedido pelo escritorio B nao acha ninguem.
    expect(await garantirCodigo(outro, maria)).toBeNull();
    expect(await comEscritorio(outro, (db) => db.codigoDeAtendimento.count())).toBe(0);
  });

  it("o código não vem junto com o cliente", async () => {
    const cliente = await comEscritorio(escritorio, (db) => db.cliente.findFirst({ where: { id: maria } }));
    expect(JSON.stringify(cliente)).not.toContain(await garantirCodigo(escritorio, maria));
  });

  it("trocar invalida o antigo e fica registrado", async () => {
    const antigo = await garantirCodigo(escritorio, joao);
    const novo = await trocarCodigo(escritorio, joao, "Dra. Helena");
    expect(novo).toMatch(FORMATO);
    expect(await garantirCodigo(escritorio, joao)).toBe(novo);
    const trocas = await comEscritorio(escritorio, (db) => db.entregaDeCodigo.findMany({ where: { clienteId: joao, canal: "TROCA" } }));
    expect(trocas).toHaveLength(1);
    expect(trocas[0].entreguePor).toBe("Dra. Helena");
    expect(antigo).toMatch(FORMATO);
  });

  it("código esquecido só volta ao e-mail que já está no cadastro", async () => {
    recebidas = [];
    // A funcao nao recebe destino: escritorio, cliente e quem pediu.
    expect(reenviarPorEmail.length).toBe(3);
    const destino = await reenviarPorEmail(escritorio, maria, "Júlia");
    expect(destino).toBe("maria@cliente.test");
    expect(recebidas.map((r) => r.para)).toEqual([["maria@cliente.test"]]);
    expect(legivel(recebidas[0].corpo)).toContain(await garantirCodigo(escritorio, maria));
    await expect(reenviarPorEmail(escritorio, semContato, "Júlia")).rejects.toBeInstanceOf(CodigoIndisponivel);
  });

  it("o contrato sai com o código e a folha; a procuração, não", async () => {
    const codigo = (await garantirCodigo(escritorio, maria))!;
    const dados = {
      clienteId: maria,
      cliente: { nome: "Maria da Silva", documento: "529.982.247-25", email: null, telefone: null, endereco: null },
      escritorio: { nome: "Banca do Código", cidade: "Salvador", telefoneAtendimento: "(71) 3000-1122" },
    };
    const contrato = await gerarPeca(escritorio, "CONTRATO", dados, "PDF");
    expect(contrato.texto).toContain(`código de atendimento ${codigo}`);
    expect(contrato.texto).toContain("CÓDIGO DE ATENDIMENTO");
    expect(contrato.semValor).not.toContain("cliente.codigo_atendimento");
    const semCodigo = await gerarPeca(escritorio, "CONTRATO", { ...dados, clienteId: undefined }, "PDF");
    expect(contrato.paginas!).toBeGreaterThan(semCodigo.paginas!);
    const procuracao = await gerarPeca(escritorio, "PROCURACAO", dados, "PDF");
    expect(procuracao.texto).not.toContain(codigo);
  });

  it("primeiro aviso: uma vez por canal, respeitando o cadastro; depois, um reforço por semana, sem o código", async () => {
    await garantirCodigo(escritorio, semContato);
    recebidas = [];
    const r = await enviarPrimeiroAviso(escritorio, { quem: "Dra. Helena" });
    // Maria recebe; Joao desligou o e-mail no cadastro; o terceiro nao tem contato.
    expect(r).toMatchObject({ avisados: 1, emails: 1, whatsapps: 0, faltam: 0, progrediu: true });
    expect(recebidas.map((x) => x.para[0])).toEqual(["maria@cliente.test"]);
    const codigo = (await garantirCodigo(escritorio, maria))!;
    expect(legivel(recebidas[0].corpo)).toContain(codigo);

    // De novo: ninguem recebe duas vezes.
    recebidas = [];
    expect(await enviarPrimeiroAviso(escritorio, { quem: "Dra. Helena" })).toMatchObject({ avisados: 0, progrediu: false });
    expect(await enviarPrimeiroAviso(escritorio, { quem: "x", apenasClienteId: maria })).toMatchObject({ avisados: 0 });
    expect(recebidas).toHaveLength(0);

    const estado = () => comEscritorio(escritorio, (db) => db.codigoDeAtendimento.findFirstOrThrow({ where: { clienteId: maria } }));
    const primeiro = (await estado()).avisoEm!;
    expect((await estado()).avisoEtapa).toBe(1);

    // Antes de uma semana, e fora do horario comercial, nada sai.
    const dia = (n: number, hora: string) => new Date(`${new Date(primeiro.getTime() + n * 86_400_000).toISOString().slice(0, 10)}T${hora}:00-03:00`);
    expect((await continuarCampanha(escritorio, dia(3, "10:00"))).enviados).toBe(0);
    expect((await continuarCampanha(escritorio, dia(8, "03:00"))).enviados).toBe(0);

    // Uma semana depois, em horario comercial: o reforco 2, sem o codigo.
    expect((await continuarCampanha(escritorio, dia(8, "10:00"))).enviados).toBe(1);
    expect(recebidas).toHaveLength(1);
    const corpo = legivel(recebidas[0].corpo);
    expect(corpo).toContain("Lembrete de segurança");
    expect(corpo).not.toContain(codigo);
    expect((await estado()).avisoEtapa).toBe(2);
    // No mesmo dia nao sai outro: o relogio e do ultimo aviso do cliente.
    expect((await continuarCampanha(escritorio, dia(8, "11:00"))).enviados).toBe(0);

    // Quem nunca foi avisado pelo administrador nao entra na rotina.
    expect((await comEscritorio(escritorio, (db) => db.codigoDeAtendimento.findFirstOrThrow({ where: { clienteId: joao } }))).avisoEtapa).toBe(0);
    const reforcos = await comEscritorio(escritorio, (db) => db.entregaDeCodigo.count({ where: { canal: "REFORCO" } }));
    expect(reforcos).toBe(1);
  });

  it("sem telefone de atendimento, o aviso não sai: ele manda o cliente ligar", async () => {
    await expect(enviarPrimeiroAviso(outro, { quem: "x" })).rejects.toBeInstanceOf(CodigoIndisponivel);
  });
});
