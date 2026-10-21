// A peca em PDF indo para o e-mail do cliente (21/10/2026).
//
// O QUE ESTES TESTES PROTEGEM: documento de cliente. O endereco vem do
// cadastro, o PDF vai anexo de verdade (nao um link), o recado de quem
// mandou vai no corpo, o envio fica registrado, e sem e-mail no cadastro
// ou sem remetente conectado nada sai.
import { SMTPServer } from "smtp-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { salvarIntegracao } from "../src/lib/integracao";
import { NaoDaParaMandar } from "../src/lib/documento-no-whatsapp";
import { mandarPecaPorEmail } from "../src/lib/documento-por-email";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

d("mandar a peça por e-mail", () => {
  let escritorio = "";
  let smtp: SMTPServer;
  let porta = 0;
  const recebidas: { para: string[]; corpo: string }[] = [];

  const ESCRITORIO = {
    nome: "Banca do E-mail",
    cidade: "Barreiras",
    telefoneAtendimento: "(77) 3611-0000",
    razaoSocial: null,
    cnpj: null,
    registroOab: null,
    enderecos: null,
  };
  const cliente = (email: string | null) => ({
    nome: "Maria Helena de Souza",
    documento: "12345678900",
    email,
    telefone: "(77) 98888-0000",
    endereco: null,
  });

  beforeAll(async () => {
    process.env.SEGREDO_CHAVE ??= Buffer.alloc(32, 6).toString("base64");
    smtp = new SMTPServer({
      authOptional: false,
      disabledCommands: ["STARTTLS"],
      onAuth(c, _s, pronto) {
        if (c.username === "escritorio" && c.password === "segredo") pronto(null, { user: c.username });
        else pronto(new Error("Usuário ou senha inválidos"));
      },
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

    escritorio = (
      await prismaPlataforma().escritorio.create({
        data: { slug: `docmail-${Date.now()}`, nome: ESCRITORIO.nome, cidade: "Barreiras", telefoneAtendimento: ESCRITORIO.telefoneAtendimento },
      })
    ).id;
    await comEscritorio(escritorio, (db) =>
      db.moduloContratado.create({ data: semEscritorio({ modulo: "EMAIL", ativo: true }) }),
    );
  });

  afterAll(async () => {
    if (escritorio) await prismaPlataforma().escritorio.delete({ where: { id: escritorio } }).catch(() => {});
    await new Promise<void>((ok) => smtp.close(() => ok()));
  });

  it("sem remetente conectado, não sai e diz o caminho", async () => {
    await expect(
      mandarPecaPorEmail(escritorio, "PROCURACAO", { clienteId: "cli-1", cliente: cliente("maria@exemplo.test"), escritorio: ESCRITORIO }),
    ).rejects.toThrow(/Integrações/);
  });

  it("vai para o e-mail do cadastro, com o PDF anexo e o recado, e fica registrado", async () => {
    await salvarIntegracao(
      escritorio,
      "SMTP",
      { host: "127.0.0.1", porta: String(porta), usuario: "escritorio", senha: "segredo", remetente: "contato@banca.adv.br" },
      "OK",
    );
    const r = await mandarPecaPorEmail(
      escritorio,
      "PROCURACAO",
      { clienteId: "cli-1", cliente: cliente("Maria@Exemplo.test"), escritorio: ESCRITORIO },
      null,
      "Assine e devolva até sexta.",
    );
    expect(r.email).toBe("maria@exemplo.test");
    expect(r.nomeDoArquivo).toMatch(/\.pdf$/);
    expect(recebidas).toHaveLength(1);
    expect(recebidas[0].para).toEqual(["maria@exemplo.test"]);
    expect(recebidas[0].corpo).toContain("application/pdf");
    expect(recebidas[0].corpo).toContain("Assine e devolva at");
    expect(recebidas[0].corpo).toContain("Banca do E-mail");

    const aviso = await comEscritorio(escritorio, (db) =>
      db.aviso.findFirstOrThrow({ where: { chave: { startsWith: "email:documento:PROCURACAO:" } } }),
    );
    expect(aviso).toMatchObject({ canal: "EMAIL", estado: "ENVIADO", destino: "maria@exemplo.test", clienteId: "cli-1" });
  });

  it("CLIENTE SEM E-MAIL não manda nada", async () => {
    const antes = recebidas.length;
    await expect(
      mandarPecaPorEmail(escritorio, "PROCURACAO", { clienteId: "cli-2", cliente: cliente(null), escritorio: ESCRITORIO }),
    ).rejects.toBeInstanceOf(NaoDaParaMandar);
    await expect(
      mandarPecaPorEmail(escritorio, "PROCURACAO", { clienteId: "cli-2", cliente: cliente("sem-arroba"), escritorio: ESCRITORIO }),
    ).rejects.toBeInstanceOf(NaoDaParaMandar);
    expect(recebidas).toHaveLength(antes);
  });

  it("recibo com valor em branco não sai", async () => {
    await expect(
      mandarPecaPorEmail(escritorio, "RECIBO", { clienteId: "cli-1", cliente: cliente("maria@exemplo.test"), escritorio: ESCRITORIO }),
    ).rejects.toThrow(/campo em branco/);
  });
});
