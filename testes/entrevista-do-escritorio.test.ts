// A entrevista contra o banco, com um modelo de mentira no lugar da Anthropic.
//
// O QUE ESTES TESTES PROTEGEM:
//
// 1. a tela nunca fica sem roteiro — nem sem modulo de IA, nem com a API
//    fora do ar. Entrevista e conversa marcada: nao da para adiar porque um
//    servico de terceiro caiu;
// 2. reescrever a anotacao APAGA a analise anterior. Uma analise que descreve
//    um texto que nao existe mais e pior que nenhuma, porque parece conferida;
// 3. anotacao curta nao vira chamada paga. Com tres linhas a IA preencheria o
//    vazio inventando, que e exatamente o que o prompt proibe.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { ROTEIRO_BASICO, TranscricaoCurta } from "../src/lib/entrevista";
import {
  anotar,
  criarEntrevista,
  transcreverAudio,
  entrevistasDoEscritorio,
  gerarRoteiro,
  ligarAoCliente,
  organizar,
  excluirEntrevista,
  gerarMinuta,
  EntrevistaIncompleta,
  EntrevistaNaoEncontrada,
  ProcessoNaoCadastrado,
  ProcuracaoIlegivel,
  SemPerguntas,
  lerRespostaDaProcuracao,
  pdfDasPerguntas,
  roteiroDaProcuracao,
  guardarGravacaoDoEnvio,
  guardarGravacaoNaPasta,
  guardarPdfNaPasta,
} from "../src/lib/entrevista-do-escritorio";
import { anexarAoEnvio, tamanhoDoEnvio } from "../src/lib/armazenamento";
import { lerArquivo } from "../src/lib/arquivos";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

/** Texto longo o bastante para valer uma organização. */
const RELATO = [
  "O cliente trabalhou cinco anos na fazenda sem registro em carteira.",
  "Saiu em marco de 2026, depois de uma discussao com o gerente.",
  "Não recebeu aviso prévio nem as ferias que tinha a receber.",
  "Disse que o colega do setor viu tudo e aceita testemunhar.",
  "Tem recibos de pagamento feitos a mão, guardados numa pasta em casa.",
].join(" ");

d("entrevista de triagem", () => {
  let escritorio = "";
  let servidor: Server;
  let saida: Record<string, unknown> = {};
  let chamadas = 0;
  let quebrado = false;
  /** O que foi mandado a IA na última chamada. */
  let ultimoCorpo = "";

  beforeAll(async () => {
    servidor = createServer((req, res) => {
      let corpo = "";
      req.on("data", (p) => (corpo += p));
      req.on("end", () => {
        chamadas += 1;
        ultimoCorpo = corpo;
        if (quebrado) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: "fora do ar" } }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "msg_teste",
            type: "message",
            role: "assistant",
            model: "claude-opus-5",
            content: [{ type: "text", text: JSON.stringify(saida) }],
            stop_reason: "end_turn",
            usage: { input_tokens: 1200, output_tokens: 400 },
          }),
        );
      });
    });
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    const porta = (servidor.address() as { port: number }).port;
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${porta}`;
    process.env.ANTHROPIC_API_KEY = "chave-de-teste";

    const e = await prismaPlataforma().escritorio.create({
      data: { slug: `entrevista-${Date.now()}`, nome: "Banca da Entrevista" },
    });
    escritorio = e.id;
    await comEscritorio(escritorio, (db) =>
      db.moduloContratado.create({
        data: semEscritorio({ modulo: "IA", ativo: true }),
      }),
    );
  });

  afterAll(async () => {
    delete process.env.ANTHROPIC_BASE_URL;
    if (escritorio) {
      await prismaPlataforma()
        .escritorio.delete({ where: { id: escritorio } })
        .catch(() => {});
    }
    await new Promise<void>((ok) => servidor.close(() => ok()));
    await prismaPlataforma().$disconnect();
  });

  beforeEach(() => {
    chamadas = 0;
    quebrado = false;
    saida = { perguntas: ["Quando foi dispensado?", "Tem recibo?"] };
  });

  /** Quanto já foi medido desta métrica para este escritório no mês. */
  async function medidoDe(metrica: string): Promise<number> {
    const linhas = await comEscritorio(escritorio, (db) =>
      db.consumoMensal.findMany({ where: { metrica } }),
    );
    return linhas.reduce((soma, l) => soma + l.quantidade, 0);
  }

  const medido = () => medidoDe("IA_MIL_TOKENS");

  async function nova(assunto = "Foi mandado embora sem receber") {
    return criarEntrevista(escritorio, {
      nome: "Pessoa Atendida",
      assunto,
      usuarioId: "usuario-de-teste",
    });
  }

  it("nasce sem cliente: quem procura o escritório pode não contratar", async () => {
    const e = await nova();
    expect(e.clienteId).toBeNull();
    expect(e.situacao).toBe("RASCUNHO");
  });

  it("o roteiro vem da IA e o consumo e medido", async () => {
    const e = await nova();
    const antes = await medido();
    const { perguntas, comIA } = await gerarRoteiro(escritorio, e.id, "u");
    expect(comIA).toBe(true);
    expect(perguntas).toEqual(["Quando foi dispensado?", "Tem recibo?"]);
    expect(await medido()).toBeGreaterThan(antes);
  });

  it("IA fora do ar não deixa a entrevista sem roteiro", async () => {
    const e = await nova();
    quebrado = true;
    const { perguntas, comIA } = await gerarRoteiro(escritorio, e.id, "u");
    expect(comIA).toBe(false);
    expect(perguntas).toEqual([...ROTEIRO_BASICO]);
    const guardada = await comEscritorio(escritorio, (db) =>
      db.entrevista.findFirst({ where: { id: e.id } }),
    );
    expect(guardada?.situacao).toBe("ROTEIRO");
  });

  it("pedir o roteiro de novo substitui, não empilha", async () => {
    const e = await nova();
    await gerarRoteiro(escritorio, e.id, "u");
    saida = { perguntas: ["Outra pergunta?"] };
    const { perguntas } = await gerarRoteiro(escritorio, e.id, "u");
    expect(perguntas).toEqual(["Outra pergunta?"]);
  });

  it("anotação curta não vira chamada paga", async () => {
    const e = await nova();
    await anotar(escritorio, e.id, "Foi demitido.");
    chamadas = 0;
    await expect(organizar(escritorio, e.id)).rejects.toBeInstanceOf(
      TranscricaoCurta,
    );
    expect(chamadas).toBe(0);
  });

  it("organiza a anotação e guarda o texto original junto", async () => {
    const e = await nova();
    await anotar(escritorio, e.id, RELATO);
    saida = {
      area: "trabalhista",
      resumo: "Trabalhou sem registro e saiu sem receber.",
      fatos: ["Trabalhou cinco anos sem registro."],
      pretensoes: ["Receber as verbas"],
      documentosCitados: ["recibos feitos a mão"],
      documentosQueFaltam: ["CTPS"],
      testemunhas: ["colega do setor"],
      pontosDeAtencao: ["Conferir se há risco de prescrição"],
      perguntasEmAberto: ["Qual era o salario?"],
      urgencia: "ALTA",
      valorEnvolvido: null,
    };
    const analise = await organizar(escritorio, e.id);
    expect(analise.area).toBe("trabalhista");
    expect(analise.urgencia).toBe("ALTA");

    const guardada = await comEscritorio(escritorio, (db) =>
      db.entrevista.findFirst({ where: { id: e.id } }),
    );
    expect(guardada?.situacao).toBe("ANALISADA");
    expect(guardada?.urgencia).toBe("ALTA");
    expect(guardada?.modelo).toBe("claude-opus-5");
    // O que foi dito continua la: sem ele ninguem confere a organizacao.
    expect(guardada?.transcricao).toBe(RELATO);
  });

  it("urgência fora da lista vira MEDIA, em vez de ir crua para a coluna", async () => {
    const e = await nova();
    await anotar(escritorio, e.id, RELATO);
    saida = {
      area: "civel",
      resumo: "x",
      fatos: [],
      pretensoes: [],
      documentosCitados: [],
      documentosQueFaltam: [],
      testemunhas: [],
      pontosDeAtencao: [],
      perguntasEmAberto: [],
      urgencia: "GRAVISSIMA",
      valorEnvolvido: null,
    };
    const analise = await organizar(escritorio, e.id);
    expect(analise.urgencia).toBe("MEDIA");
  });

  it("reescrever a anotação apaga a análise: ela descrevia outro texto", async () => {
    const e = await nova();
    await anotar(escritorio, e.id, RELATO);
    saida = {
      area: "trabalhista",
      resumo: "x",
      fatos: [],
      pretensoes: [],
      documentosCitados: [],
      documentosQueFaltam: [],
      testemunhas: [],
      pontosDeAtencao: [],
      perguntasEmAberto: [],
      urgencia: "BAIXA",
      valorEnvolvido: null,
    };
    await organizar(escritorio, e.id);

    await anotar(escritorio, e.id, `${RELATO} Depois disso, mudou tudo.`);
    const guardada = await comEscritorio(escritorio, (db) =>
      db.entrevista.findFirst({ where: { id: e.id } }),
    );
    expect(guardada?.analise).toBeNull();
    expect(guardada?.urgencia).toBeNull();
    expect(guardada?.situacao).toBe("ANOTADA");
  });

  it("o áudio transcrito ACRESCENTA a anotação, não substitui", async () => {
    // Quem envia o audio da segunda metade da reuniao nao quer perder a
    // primeira. Apagar o campo antes e reversivel; perder o que ja estava
    // escrito, nao.
    const e = await nova();
    await anotar(escritorio, e.id, RELATO);

    const audio = createServer((req, res) => {
      req.on("data", () => {});
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ text: "Parte vinda do áudio.", duration: 130 }));
      });
    });
    await new Promise<void>((ok) => audio.listen(0, "127.0.0.1", ok));
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(audio.address() as { port: number }).port}`;
    process.env.OPENAI_API_KEY = "chave-de-teste";

    const antes = await medidoDe("TRANSCRICAO_MIN");
    try {
      const r = await transcreverAudio(escritorio, e.id, {
        nome: "reuniao.mp3",
        tipo: "audio/mpeg",
        dados: Buffer.alloc(200 * 1024, 3),
      });
      expect(r.texto).toContain(RELATO);
      expect(r.texto).toContain("Parte vinda do áudio.");
      expect(r.acrescentado).toBe("Parte vinda do áudio.");

      // 130 segundos arredondam para 3 minutos.
      expect(await medidoDe("TRANSCRICAO_MIN")).toBe(antes + 3);
    } finally {
      delete process.env.OPENAI_BASE_URL;
      await new Promise<void>((ok) => audio.close(() => ok()));
    }
  });

  it("gravação na tela: trechos pela OpenAI, como ela responde de verdade", async () => {
    // Como a API real do gpt-4o-transcribe: verbose_json e recusado (400) e a
    // resposta traz so o texto. Antes, toda transcricao de audio falhava aqui.
    const respostas = ["Bom dia, doutor.", "", "Fui demitido em marco."];
    const audio = createServer((req, res) => {
      let corpo = "";
      req.on("data", (c) => (corpo += c));
      req.on("end", () => {
        if (corpo.includes("verbose_json")) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: "response_format 'verbose_json' is not compatible with model 'gpt-4o-transcribe'. Use 'json' or 'text' instead." } }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ text: respostas.shift() ?? "" }));
      });
    });
    await new Promise<void>((ok) => audio.listen(0, "127.0.0.1", ok));
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(audio.address() as { port: number }).port}`;
    process.env.OPENAI_API_KEY = "chave-de-teste";

    const e = await nova();
    const trecho = { nome: "trecho.webm", tipo: "audio/webm", dados: Buffer.alloc(40 * 1024, 5) };
    try {
      const um = await transcreverAudio(escritorio, e.id, trecho, { continua: true, origem: "AUDIO_GRAVADO" });
      expect(um.texto).toBe("Bom dia, doutor.");
      // Um minuto de silencio: nao e erro e nao mexe no texto.
      const dois = await transcreverAudio(escritorio, e.id, trecho, { continua: true, origem: "AUDIO_GRAVADO" });
      expect(dois).toEqual({ texto: "Bom dia, doutor.", acrescentado: "" });
      // O trecho seguinte continua na mesma linha.
      const tres = await transcreverAudio(escritorio, e.id, trecho, { continua: true, origem: "AUDIO_GRAVADO" });
      expect(tres.texto).toBe("Bom dia, doutor. Fui demitido em marco.");
      const gravada = await comEscritorio(escritorio, (db) => db.entrevista.findFirstOrThrow({ where: { id: e.id } }));
      expect(gravada.origemTranscricao).toBe("AUDIO_GRAVADO");
    } finally {
      delete process.env.OPENAI_BASE_URL;
      await new Promise<void>((ok) => audio.close(() => ok()));
    }
  });

  it("oitiva de testemunha: roteiro próprio, com o processo; sem petição inicial; exclui de vez", async () => {
    await comEscritorio(escritorio, (db) =>
      db.processo.create({
        data: semEscritorio({
          numero: "10000771220268260222",
          classe: "RECLAMACAO TRABALHISTA",
          partes: [{ nome: "JOAO DA SILVA", polo: "A" }, { nome: "FAZENDA BOA VISTA LTDA", polo: "P" }],
          ultimoAndamentoTipo: "Despacho",
          ultimoAndamentoTexto: "Designo audiência de instrução.",
        }),
      }),
    );
    await expect(
      criarEntrevista(escritorio, {
        nome: "Pedro", assunto: "Viu a discussao na fazenda", usuarioId: "x", tipo: "TESTEMUNHA", numeroProcesso: "9999999-99.2026.8.26.0222",
      }),
    ).rejects.toBeInstanceOf(ProcessoNaoCadastrado);

    const e = await criarEntrevista(escritorio, {
      nome: "Pedro Colega",
      assunto: "Viu a discussao com o gerente na fazenda",
      usuarioId: "x",
      tipo: "TESTEMUNHA",
      numeroProcesso: "1000077-12.2026.8.26.0222",
    });
    expect(e.tipo).toBe("TESTEMUNHA");
    expect(e.processoId).not.toBeNull();

    await gerarRoteiro(escritorio, e.id, "x", "reclamação trabalhista");
    // O pedido a IA leva o roteiro de testemunha e o contexto do processo.
    expect(ultimoCorpo).toContain("TESTEMUNHA");
    expect(ultimoCorpo).toContain("Oitiva de testemunha");
    expect(ultimoCorpo).toContain("RECLAMACAO TRABALHISTA");
    expect(ultimoCorpo).toContain("FAZENDA BOA VISTA LTDA");
    expect(ultimoCorpo).toContain("Designo audiência de instrução.");

    // Texto da peticao inicial e so da triagem.
    await expect(gerarMinuta(escritorio, e.id, "x")).rejects.toBeInstanceOf(EntrevistaIncompleta);

    await excluirEntrevista(escritorio, e.id);
    expect(await comEscritorio(escritorio, (db) => db.entrevista.count({ where: { id: e.id } }))).toBe(0);
    await expect(excluirEntrevista(escritorio, e.id)).rejects.toBeInstanceOf(EntrevistaNaoEncontrada);
  });

  it("procuração: le o tipo de ação, gera as perguntas e o PDF para o cliente", async () => {
    const e = await nova();
    // Sem perguntas ainda, nao ha PDF.
    await expect(pdfDasPerguntas(escritorio, e.id)).rejects.toBeInstanceOf(SemPerguntas);

    saida = {
      tipoAcao: "reclamação trabalhista por rescisão indireta",
      outorgante: "JOAO DA SILVA",
      observacao: null,
      perguntas: ["Quando você começou a trabalhar lá?", "Você tinha carteira assinada?", "Quanto você recebia por mês?"],
    };
    const procuracao = { nome: "procuracao.pdf", tipo: "application/pdf", dados: Buffer.from("%PDF-1.4 procuração de teste") };
    const r = await roteiroDaProcuracao(escritorio, e.id, procuracao);
    expect(r.tipoAcao).toBe("reclamação trabalhista por rescisão indireta");
    expect(r.perguntas).toHaveLength(3);
    // A procuracao foi junto, como documento, para a IA ler.
    expect(ultimoCorpo).toContain('"type":"document"');

    const gravada = await comEscritorio(escritorio, (db) => db.entrevista.findFirstOrThrow({ where: { id: e.id } }));
    expect(gravada.tipoAcao).toBe("reclamação trabalhista por rescisão indireta");
    expect(gravada.roteiro).toEqual(r.perguntas);

    const { pdf, nome } = await pdfDasPerguntas(escritorio, e.id);
    expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe("%PDF");
    expect(nome).toMatch(/^Perguntas - /);
  });

  it("resposta da leitura: aceita cerca de código; sem JSON e erro; sem perguntas vale o básico", () => {
    const lido = lerRespostaDaProcuracao('```json\n{"tipoAcao": null, "observacao": "Procuração só ad judicia, sem a ação.", "perguntas": ["O que aconteceu?"]}\n```');
    expect(lido.tipoAcao).toBeNull();
    expect(lido.observacao).toMatch(/ad judicia/);
    expect(() => lerRespostaDaProcuracao("não consegui ler")).toThrow(ProcuracaoIlegivel);
    expect(lerRespostaDaProcuracao('{"perguntas": []}').perguntas).toEqual([...ROTEIRO_BASICO]);
  });

  it("a gravação e o PDF vão para a pasta do cliente escolhido; sem cliente, não", async () => {
    const usuario = await comEscritorio(escritorio, (db) =>
      db.usuario.create({ data: semEscritorio({ nome: "Dra. Pasta", email: `pasta-${Date.now()}@e.test`, senhaHash: "x", papel: "ADMIN" }) }),
    );
    const cliente = await comEscritorio(escritorio, (db) =>
      db.cliente.create({ data: semEscritorio({ nome: "Cliente da Pasta" }) }),
    );
    // Cliente de OUTRO escritorio nao se liga.
    await expect(
      criarEntrevista(escritorio, { nome: "X", assunto: "Assunto qualquer longo", usuarioId: usuario.id, clienteId: "nao-e-daqui" }),
    ).rejects.toBeInstanceOf(EntrevistaNaoEncontrada);

    const sem = await criarEntrevista(escritorio, { nome: "Sem Cliente", assunto: "Ainda não e cliente do escritório", usuarioId: usuario.id });
    const r0 = await guardarGravacaoNaPasta(escritorio, sem.id, usuario.id, { tipo: "audio/webm", dados: Buffer.alloc(8 * 1024, 7) });
    expect(r0.guardado).toBe(false);

    const e = await criarEntrevista(escritorio, {
      nome: "Cliente da Pasta",
      assunto: "Demissao sem justa causa e verbas",
      usuarioId: usuario.id,
      clienteId: cliente.id,
    });
    const r1 = await guardarGravacaoNaPasta(escritorio, e.id, usuario.id, { tipo: "audio/webm;codecs=opus", dados: Buffer.alloc(8 * 1024, 7) });
    expect(r1.guardado).toBe(true);
    await anotar(escritorio, e.id, RELATO);
    const r2 = await guardarPdfNaPasta(escritorio, e.id, usuario.id);
    expect(r2.guardado).toBe(true);

    const naPasta = await comEscritorio(escritorio, (db) =>
      db.arquivo.findMany({ where: { clienteId: cliente.id }, select: { nome: true, tipo: true } }),
    );
    expect(naPasta.map((a) => a.tipo).sort()).toEqual(["application/pdf", "audio/webm"]);
    expect(naPasta.find((a) => a.tipo === "audio/webm")?.nome).toMatch(/^Entrevista .* - Cliente da Pasta - gravação .*\.webm$/);
  });

  it("gravação longa chega em partes e vai inteira para a pasta; sem cliente, o envio e apagado", async () => {
    const usuario = await comEscritorio(escritorio, (db) =>
      db.usuario.create({ data: semEscritorio({ nome: "Dra. Longa", email: `longa-${Date.now()}@e.test`, senhaHash: "x", papel: "ADMIN" }) }),
    );
    const cliente = await comEscritorio(escritorio, (db) =>
      db.cliente.create({ data: semEscritorio({ nome: "Cliente da Gravação Longa" }) }),
    );
    const parte = (n: number) => Buffer.alloc(64 * 1024, n);

    const sem = await criarEntrevista(escritorio, { nome: "Sem Cliente", assunto: "Ainda não e cliente do escritório", usuarioId: usuario.id });
    await anexarAoEnvio(escritorio, "envio_sem_cliente_01", 0, parte(1), 10 * 1024 * 1024);
    const r0 = await guardarGravacaoDoEnvio(escritorio, sem.id, usuario.id, "audio/webm", "envio_sem_cliente_01");
    expect(r0.guardado).toBe(false);
    expect(await tamanhoDoEnvio(escritorio, "envio_sem_cliente_01")).toBe(0);

    const e = await criarEntrevista(escritorio, {
      nome: "Cliente da Gravação Longa",
      assunto: "Acidente de trabalho e estabilidade",
      usuarioId: usuario.id,
      clienteId: cliente.id,
    });
    await anexarAoEnvio(escritorio, "envio_com_cliente_01", 0, parte(1), 10 * 1024 * 1024);
    await anexarAoEnvio(escritorio, "envio_com_cliente_01", 64 * 1024, parte(2), 10 * 1024 * 1024);
    const r1 = await guardarGravacaoDoEnvio(escritorio, e.id, usuario.id, "audio/webm;codecs=opus", "envio_com_cliente_01");
    expect(r1.guardado).toBe(true);

    const guardado = await comEscritorio(escritorio, (db) =>
      db.arquivo.findFirstOrThrow({ where: { clienteId: cliente.id }, select: { id: true, tipo: true, tamanhoBytes: true } }),
    );
    expect(guardado.tipo).toBe("audio/webm");
    expect(Number(guardado.tamanhoBytes)).toBe(128 * 1024);
    const lido = await lerArquivo(escritorio, guardado.id);
    expect(Buffer.from(lido.conteudo).equals(Buffer.concat([parte(1), parte(2)]))).toBe(true);
  });

  it("liga ao cliente quando o caso e aceito", async () => {
    const e = await nova();
    const cliente = await comEscritorio(escritorio, (db) =>
      db.cliente.create({ data: semEscritorio({ nome: "Virou Cliente" }) }),
    );
    const ligada = await ligarAoCliente(escritorio, e.id, cliente.id);
    expect(ligada.clienteId).toBe(cliente.id);
  });

  it("a lista não traz as arquivadas", async () => {
    const e = await nova("Assunto que foi arquivado");
    await comEscritorio(escritorio, (db) =>
      db.entrevista.update({
        where: { id: e.id },
        data: { situacao: "ARQUIVADA" },
      }),
    );
    const lista = await entrevistasDoEscritorio(escritorio);
    expect(lista.map((x) => x.id)).not.toContain(e.id);
  });
});
