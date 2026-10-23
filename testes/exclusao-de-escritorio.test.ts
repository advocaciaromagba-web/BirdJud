// Purga completa e exclusao definitiva de escritorio (23/10/2026).
//
// O que protege: a purga apaga TODO dado do escritorio, inclusive os modulos
// que vieram depois da lista a mao (tarefa, contrato, cliente com
// representante); o registro fiscal da plataforma fica; a exclusao pelo
// console exige o endereco digitado e o motivo, e o escritorio de teste some
// por inteiro, liberando o endereco.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { ExclusaoRecusada, excluirEscritorio, purgarEscritorio } from "../src/lib/encerramento";

const temBanco = Boolean(process.env.DATABASE_URL);
(temBanco ? describe : describe.skip)("purga e exclusão de escritório", () => {
  let operadorId = "";
  const criados: string[] = [];

  async function escritorioCheio(nome: string, pago: boolean) {
    const id = (await prismaPlataforma().escritorio.create({ data: { slug: `exc-${nome}-${Date.now()}`, nome } })).id;
    criados.push(id);
    await prismaPlataforma().assinatura.create({ data: { escritorioId: id, valorCentavos: 10_000, fimDoTeste: new Date() } });
    if (pago) {
      await prismaPlataforma().fatura.create({
        data: { escritorioId: id, competencia: "2026-10", valorCentavos: 10_000, vencimento: new Date(), status: "PAGA", pagoEm: new Date() },
      });
    }
    await comEscritorio(id, async (db) => {
      const u = await db.usuario.create({ data: semEscritorio({ nome: "Dra. X", email: `x-${Date.now()}@e.test`, senhaHash: "x", papel: "ADMIN" }) });
      const c = await db.cliente.create({ data: semEscritorio({ nome: "Cliente X", documento: "52998224725" }) });
      await db.representante.create({ data: semEscritorio({ clienteId: c.id, nome: "Representante", cpf: "11144477735", ordem: 0 }) });
      await db.contratoDeHonorarios.create({ data: semEscritorio({ clienteId: c.id, tipo: "VALOR", valorCentavos: 100_000 }) });
      await db.tarefa.create({
        data: semEscritorio({ titulo: "Contestação", vencimento: new Date(), responsavelId: u.id, criadoPorId: u.id }),
      });
    });
    return id;
  }

  const restos = async (id: string) => {
    const [tarefas, contratos, clientes, representantes, usuarios] = await Promise.all([
      prismaPlataforma().tarefa.count({ where: { escritorioId: id } }),
      prismaPlataforma().contratoDeHonorarios.count({ where: { escritorioId: id } }),
      prismaPlataforma().cliente.count({ where: { escritorioId: id } }),
      prismaPlataforma().representante.count({ where: { escritorioId: id } }),
      prismaPlataforma().usuario.count({ where: { escritorioId: id } }),
    ]);
    return tarefas + contratos + clientes + representantes + usuarios;
  };

  beforeAll(async () => {
    operadorId = (
      await prismaPlataforma().operadorPlataforma.create({ data: { nome: "Op Exclusão", email: `op-exc-${Date.now()}@t.test`, senhaHash: "x" } })
    ).id;
  });

  afterAll(async () => {
    await prismaPlataforma().acessoSuporte.deleteMany({ where: { operadorId } });
    await prismaPlataforma().operadorPlataforma.delete({ where: { id: operadorId } }).catch(() => {});
    for (const id of criados) await prismaPlataforma().escritorio.delete({ where: { id } }).catch(() => {});
  });

  it("a purga apaga tarefa, contrato, cliente e representante; a fatura fica", async () => {
    const id = await escritorioCheio("purga", true);
    expect(await restos(id)).toBeGreaterThan(0);
    await purgarEscritorio(id);
    expect(await restos(id)).toBe(0);
    expect(await prismaPlataforma().fatura.count({ where: { escritorioId: id } })).toBe(1);
    expect((await prismaPlataforma().escritorio.findUniqueOrThrow({ where: { id } })).purgadoEm).not.toBeNull();
  });

  it("exclusão exige o endereço digitado e o motivo", async () => {
    const id = await escritorioCheio("conf", false);
    await expect(excluirEscritorio(id, { confirmacao: "outro", motivo: "escritório de teste", operadorId })).rejects.toBeInstanceOf(ExclusaoRecusada);
    const slug = (await prismaPlataforma().escritorio.findUniqueOrThrow({ where: { id } })).slug;
    await expect(excluirEscritorio(id, { confirmacao: slug, motivo: "curto", operadorId })).rejects.toThrow(/motivo/);
    expect(await restos(id)).toBeGreaterThan(0);
  });

  it("escritório de teste some por inteiro; o registro do motivo fica", async () => {
    const id = await escritorioCheio("teste", false);
    const slug = (await prismaPlataforma().escritorio.findUniqueOrThrow({ where: { id } })).slug;
    const r = await excluirEscritorio(id, { confirmacao: ` ${slug.toUpperCase()} `, motivo: "cadastro de teste do suporte", operadorId });
    expect(r.modo).toBe("APAGADO");
    expect(await prismaPlataforma().escritorio.findUnique({ where: { id } })).toBeNull();
    expect(await prismaPlataforma().assinatura.count({ where: { escritorioId: id } })).toBe(0);
    const log = await prismaPlataforma().acessoSuporte.findFirstOrThrow({ where: { escritorioId: id } });
    expect(log.motivo).toContain("cadastro de teste do suporte");
  });

  it("com fatura paga: dados apagados, registro fiscal e casca guardados", async () => {
    const id = await escritorioCheio("fiscal", true);
    const slug = (await prismaPlataforma().escritorio.findUniqueOrThrow({ where: { id } })).slug;
    const r = await excluirEscritorio(id, { confirmacao: slug, motivo: "pedido de eliminação do titular", operadorId });
    expect(r.modo).toBe("PURGADO");
    expect(await restos(id)).toBe(0);
    expect(await prismaPlataforma().fatura.count({ where: { escritorioId: id } })).toBe(1);
    expect((await prismaPlataforma().escritorio.findUniqueOrThrow({ where: { id } })).status).toBe("ENCERRADO");
  });
});
