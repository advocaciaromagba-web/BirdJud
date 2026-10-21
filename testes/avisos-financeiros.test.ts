// Avisos de vencimento do financeiro (21/10/2026).
//
// O que protege o escritorio: o aviso de conta a pagar vai so para quem
// administra, uma vez por ponto da regua, e leva a pessoa direto a tela que
// resolve (financeiro ou cobrancas), nao a capa do sistema.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { incluirPessoa } from "../src/lib/equipe";
import { gerarAvisosFinanceiros } from "../src/lib/avisos";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

d("avisos financeiros", () => {
  let esc = "";
  let slug = "";
  const AGORA = new Date("2026-10-21T12:00:00Z");

  beforeAll(async () => {
    slug = `avfin-${Date.now()}`;
    esc = (await prismaPlataforma().escritorio.create({ data: { slug, nome: "Banca das Contas" } })).id;
    await incluirPessoa(esc, { nome: "Dra. Admin", email: `${slug}@eq.test`, papel: "ADMIN", senha: "senha-forte-10" });
    await incluirPessoa(esc, { nome: "Apoio", email: `${slug}-apoio@eq.test`, papel: "USUARIO", senha: "senha-forte-10" });
    await comEscritorio(esc, async (db) => {
      await db.lancamento.create({
        data: semEscritorio({
          descricao: "Aluguel da sala", tipo: "DESPESA", competencia: "2026-10", valorCentavos: 250_000,
          vencimento: new Date("2026-10-22T12:00:00Z"), fornecedor: "Imobiliária",
        }),
      });
      const cliente = await db.cliente.create({ data: semEscritorio({ nome: "Cliente das Contas" }) });
      await db.cobranca.create({
        data: semEscritorio({
          clienteId: cliente.id, descricao: "Parcela 3", valorCentavos: 90_000, forma: "PIX",
          vencimento: new Date("2026-10-21T12:00:00Z"), idNoProvedor: `${slug}-cob`,
        }),
      });
    });
  });

  afterAll(async () => {
    if (esc) await prismaPlataforma().escritorio.delete({ where: { id: esc } }).catch(() => {});
  });

  it("só o administrador recebe, com o link da tela certa; repetir não duplica", async () => {
    expect(await gerarAvisosFinanceiros(esc, AGORA)).toBe(2);
    expect(await gerarAvisosFinanceiros(esc, AGORA)).toBe(0);
    const avisos = await comEscritorio(esc, (db) => db.aviso.findMany({ orderBy: { tipo: "asc" } }));
    expect(avisos).toHaveLength(2);
    expect(avisos.every((a) => a.destino === `${slug}@eq.test`)).toBe(true);
    const conta = avisos.find((a) => a.tipo.startsWith("CONTA_"))!;
    const recebimento = avisos.find((a) => a.tipo.startsWith("RECEBIMENTO_"))!;
    expect(conta.corpo).toContain(`https://${slug}.`);
    expect(conta.corpo).toMatch(/\/financeiro$/);
    expect(recebimento.corpo).toMatch(/\/cobrancas$/);
  });
});
