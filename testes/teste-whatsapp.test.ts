import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { registrarStatus, TIPO_DO_ALERTA, TIPO_DO_TESTE } from "../src/lib/entrega-do-escritorio";
import { lerTeste } from "../src/lib/teste-whatsapp";

const d = process.env.DATABASE_URL ? describe : describe.skip;
let esc = "";
let usuario = "";

d("testar o WhatsApp em Configurações", () => {
  beforeAll(async () => {
    esc = (await prismaPlataforma().escritorio.create({ data: { slug: `zap-${Date.now()}`, nome: "Banca do Teste" } })).id;
    usuario = (
      await comEscritorio(esc, (db) =>
        db.usuario.create({ data: semEscritorio({ nome: "Helena", email: `helena-${Date.now()}@teste.br`, papel: "ADMIN", senhaHash: "x", telefone: "(16) 99230-4561" }) }),
      )
    ).id;
  });
  afterAll(async () => {
    if (esc) await prismaPlataforma().escritorio.delete({ where: { id: esc } }).catch(() => {});
  });

  const novoTeste = (idNaMeta: string, enviadoEm = new Date()) =>
    comEscritorio(esc, (db) =>
      db.aviso.create({
        data: semEscritorio({
          canal: "WHATSAPP",
          tipo: TIPO_DO_TESTE,
          chave: `teste-whatsapp:${idNaMeta}`,
          destino: "5516992304561",
          assunto: "Teste",
          corpo: "Teste",
          estado: "ENVIADO",
          enviadoEm,
          idNaMeta,
          usuarioId: usuario,
        }),
      }),
    );

  it("aceito não é funcionando: só diz ENTREGUE quando a Meta confirma", async () => {
    await novoTeste("wamid.teste1");
    expect((await lerTeste(esc, usuario))?.situacao).toBe("AGUARDANDO");
    await registrarStatus({ idNaMeta: "wamid.teste1", status: "sent" });
    expect((await lerTeste(esc, usuario))?.situacao).toBe("AGUARDANDO");
    await registrarStatus({ idNaMeta: "wamid.teste1", status: "delivered", timestamp: String(Math.floor(Date.now() / 1000)) });
    const t = await lerTeste(esc, usuario);
    expect(t?.situacao).toBe("ENTREGUE");
    expect(t?.telefone).toBe("(16) •••••-4561");
  });

  it("falha do teste mostra o motivo e não vira alerta para a equipe", async () => {
    await new Promise((r) => setTimeout(r, 5));
    await novoTeste("wamid.teste2");
    await registrarStatus({ idNaMeta: "wamid.teste2", status: "failed", codigo: 131042, titulo: "Business eligibility payment issue" });
    const t = await lerTeste(esc, usuario);
    expect(t?.situacao).toBe("FALHOU");
    expect(t?.erro).toBeTruthy();
    const alertas = await comEscritorio(esc, (db) => db.aviso.count({ where: { tipo: TIPO_DO_ALERTA } }));
    expect(alertas).toBe(0);
  });

  it("sem retorno em 5 minutos: SEM_RESPOSTA", async () => {
    await new Promise((r) => setTimeout(r, 5));
    await novoTeste("wamid.teste3", new Date(Date.now() - 6 * 60_000));
    expect((await lerTeste(esc, usuario))?.situacao).toBe("SEM_RESPOSTA");
  });
});
