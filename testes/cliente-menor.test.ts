// Cliente menor de idade (27/10/2026, vindo do sistema da Advocacia Roma).
//
// O que protege o escritorio: o documento do menor sai no nome dele com quem
// o representa, e com o verbo certo pela idade NA DATA DO DOCUMENTO —
// "representado" ate 16 anos incompletos (CC 3o), "assistido" de 16 a 18
// (CC 4o, I); trocar os dois torna o ato nulo ou anulavel. O menor cadastrado
// a partir da mae nao herda o RG nem o CPF dela. Quem assina pelo menor e
// quem o representa. Audiencia com responsavel que nao e advogado gera aviso.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { clausulaDoMenor, idadeEm, problemaDoMenor, regimeDoMenor } from "../src/lib/menor";
import { qualificacaoDoCliente } from "../src/lib/modelos-do-escritorio";
import { MenorRecusado, cadastrarMenor } from "../src/lib/menores-do-escritorio";
import { montarSignatarios } from "../src/lib/autentique";
import { atoSemAdvogado } from "../src/lib/agenda-tela";

const dia = (s: string) => new Date(`${s}T12:00:00Z`);
const hoje = dia("2026-10-27");

describe("menor, sem banco", () => {
  it("idade conta o aniversário", () => {
    expect(idadeEm(dia("2010-10-27"), hoje)).toBe(16);
    expect(idadeEm(dia("2010-10-28"), hoje)).toBe(15);
  });

  it("regime pela idade na data do documento", () => {
    expect(regimeDoMenor(dia("2015-04-03"), hoje)).toBe("REPRESENTADO");
    expect(regimeDoMenor(dia("2010-10-28"), hoje)).toBe("REPRESENTADO");
    expect(regimeDoMenor(dia("2010-10-27"), hoje)).toBe("ASSISTIDO");
    expect(regimeDoMenor(dia("2008-10-27"), hoje)).toBe("MAIOR");
    expect(regimeDoMenor(null, hoje)).toBe("SEM_DATA");
    expect(problemaDoMenor(null, hoje)).toMatch(/data de nascimento/);
    expect(problemaDoMenor(dia("2000-01-01"), hoje)).toMatch(/18 anos/);
    expect(problemaDoMenor(dia("2015-01-01"), hoje)).toBeNull();
  });

  it("cláusula: impúbere representada pela genitora; púbere assistido pelo genitor", () => {
    expect(clausulaDoMenor({ nascimento: dia("2015-04-03"), feminino: true }, [{ parentesco: "GENITORA", qualificacao: "MARIA" }], hoje)).toBe(
      "menor impúbere, nascida em 03/04/2015, neste ato representada por sua genitora MARIA",
    );
    expect(clausulaDoMenor({ nascimento: dia("2009-01-10"), feminino: false }, [{ parentesco: "GENITOR", qualificacao: "JOÃO" }], hoje)).toBe(
      "menor púbere, nascido em 10/01/2009, neste ato assistido por seu genitor JOÃO",
    );
    expect(clausulaDoMenor({ nascimento: dia("2015-04-03"), feminino: true }, [], hoje)).toBeNull();
  });

  it("qualificação do cliente menor, com a genitora no feminino", () => {
    const q = qualificacaoDoCliente(
      { nome: "Ana Lima", documento: null, email: null, telefone: null, endereco: { rua: "Rua A", numero: "10", cidade: "Guariba", uf: "SP" }, nacionalidade: "brasileira", nascimento: dia("2015-04-03"), menor: true },
      [
        {
          nome: "Maria Lima",
          cpf: "52998224725",
          rg: "12.345.678-9",
          nacionalidade: "brasileira",
          estadoCivil: "casada",
          profissao: "professora",
          mesmoEnderecoDaEmpresa: true,
          endereco: null,
          parentesco: "GENITORA",
        },
      ],
      hoje,
    );
    expect(q).toContain("Ana Lima, brasileira");
    expect(q).toContain("menor impúbere, nascida em 03/04/2015, neste ato representada por sua genitora Maria Lima");
    expect(q).toContain("portadora do RG nº 12.345.678-9");
    expect(q).toContain("inscrita no CPF sob o nº 529.982.247-25");
    expect(q).toContain("residente e domiciliada em Rua A, 10, Guariba, SP");
  });

  it("menor assina por quem o representa", () => {
    const s = montarSignatarios("PROCURACAO" as never, [{ nome: "Maria", email: "maria@e.test" }, { nome: "João", email: "joao@e.test" }], [], "CLIENTE");
    expect(s.map((x) => x.email)).toEqual(["maria@e.test", "joao@e.test"]);
  });

  it("audiência com responsável que não é advogado vira aviso", () => {
    expect(atoSemAdvogado("AUDIENCIA", "USUARIO")).toBe(true);
    expect(atoSemAdvogado("PERICIA", "ESTAGIARIO")).toBe(true);
    expect(atoSemAdvogado("AUDIENCIA", "ADVOGADO")).toBe(false);
    expect(atoSemAdvogado("COMPROMISSO", "USUARIO")).toBe(false);
    expect(atoSemAdvogado("AUDIENCIA", null)).toBe(false);
  });
});

const temBanco = Boolean(process.env.DATABASE_URL);
(temBanco ? describe : describe.skip)("menor cadastrado a partir de quem o representa", () => {
  let esc = "";
  let mae = "";
  let semCpf = "";

  beforeAll(async () => {
    esc = (await prismaPlataforma().escritorio.create({ data: { slug: `menor-${Date.now()}`, nome: "Banca do Menor" } })).id;
    mae = (
      await comEscritorio(esc, (db) =>
        db.cliente.create({
          data: semEscritorio({
            nome: "Maria Lima",
            documento: "52998224725",
            rg: "12.345.678-9",
            nacionalidade: "brasileira",
            estadoCivil: "casada",
            profissao: "professora",
            email: "maria@e.test",
            telefone: "(16) 99999-0000",
            endereco: { rua: "Rua A", numero: "10", cidade: "Guariba", uf: "SP" },
          }),
        }),
      )
    ).id;
    semCpf = (await comEscritorio(esc, (db) => db.cliente.create({ data: semEscritorio({ nome: "Sem CPF" }) }))).id;
  });

  afterAll(async () => {
    if (esc) await prismaPlataforma().escritorio.delete({ where: { id: esc } }).catch(() => {});
  });

  it("nasce ligado, com endereço e contato, sem o RG e o CPF da mãe; ela entra como genitora", async () => {
    const m = await cadastrarMenor(esc, mae, { nome: "Ana Lima", nascimento: "2015-04-03", parentesco: "GENITORA", nacionalidade: "brasileira" }, hoje);
    const menor = await comEscritorio(esc, (db) => db.cliente.findFirstOrThrow({ where: { id: m.id }, include: { representantes: true } }));
    expect(menor.menor).toBe(true);
    expect(menor.responsavelClienteId).toBe(mae);
    expect(menor.rg).toBeNull();
    expect(menor.documento).toBeNull();
    expect(menor.email).toBe("maria@e.test");
    expect((menor.endereco as { cidade: string }).cidade).toBe("Guariba");
    expect(menor.representantes).toHaveLength(1);
    expect(menor.representantes[0]).toMatchObject({ nome: "Maria Lima", cpf: "52998224725", rg: "12.345.678-9", parentesco: "GENITORA" });
  });

  it("recusa: maior de idade, sem data, responsável sem CPF, CPF da mãe no menor", async () => {
    await expect(cadastrarMenor(esc, mae, { nome: "Adulto", nascimento: "2000-01-01", parentesco: "GENITORA" }, hoje)).rejects.toThrow(/18 anos/);
    await expect(cadastrarMenor(esc, mae, { nome: "Sem data", nascimento: "", parentesco: "GENITORA" }, hoje)).rejects.toBeInstanceOf(MenorRecusado);
    await expect(cadastrarMenor(esc, semCpf, { nome: "Filho", nascimento: "2015-01-01", parentesco: "GENITOR" }, hoje)).rejects.toThrow(/CPF de Sem CPF/);
    await expect(
      cadastrarMenor(esc, mae, { nome: "Filho", nascimento: "2015-01-01", parentesco: "GENITORA", documento: "529.982.247-25" }, hoje),
    ).rejects.toThrow(/do responsável/);
  });
});
