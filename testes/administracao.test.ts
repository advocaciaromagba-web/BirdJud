// A segunda senha. Isto tem teste denso porque e a porta do financeiro e das
// acoes destrutivas: o que passa por aqui ve o faturamento do escritorio e
// apaga usuario.
import { describe, expect, it } from "vitest";
import {
  MINIMO_DE_CARACTERES,
  MINUTOS_DESTRAVADO,
  conferirDestravamento,
  emitirDestravamento,
  marcaDaSenha,
  senhaAceitavel,
} from "@/lib/administracao";

const SEGREDO = "segredo-de-teste-do-destravamento";
const AGORA = new Date("2026-09-28T12:00:00Z");
const DONO = {
  escritorioId: "esc-1",
  usuarioId: "usr-1",
  marca: marcaDaSenha("$2a$12$hashdeexemplo"),
};

describe("marca da senha", () => {
  it("muda quando o hash muda, e nao devolve o hash", () => {
    const a = marcaDaSenha("$2a$12$um");
    const b = marcaDaSenha("$2a$12$outro");
    expect(a).not.toBe(b);
    expect(a).toHaveLength(16);
    expect("$2a$12$um").not.toContain(a);
  });
});

describe("destravamento", () => {
  it("aceita o que emitiu", () => {
    const t = emitirDestravamento(DONO, SEGREDO, AGORA);
    expect(conferirDestravamento(t, DONO, SEGREDO, AGORA)).toBeNull();
  });

  it("recusa quando nao ha cookie", () => {
    expect(conferirDestravamento(undefined, DONO, SEGREDO, AGORA)).toBe(
      "sem destravamento",
    );
  });

  it("recusa cookie remendado", () => {
    const t = emitirDestravamento(DONO, SEGREDO, AGORA);
    const [e, u, m, exp, ass] = t.split(".");
    // Esticar a validade sem reassinar e a tentativa obvia.
    const esticado = [e, u, m, String(Number(exp) + 10 * 60_000), ass].join(".");
    expect(conferirDestravamento(esticado, DONO, SEGREDO, AGORA)).toBe(
      "assinatura invalida",
    );
  });

  it("recusa assinatura de outro segredo", () => {
    const t = emitirDestravamento(DONO, "outro-segredo", AGORA);
    expect(conferirDestravamento(t, DONO, SEGREDO, AGORA)).toBe(
      "assinatura invalida",
    );
  });

  // Isolamento: destravar no escritorio A nao pode valer no B.
  it("recusa destravamento de outro escritorio", () => {
    const t = emitirDestravamento({ ...DONO, escritorioId: "esc-2" }, SEGREDO, AGORA);
    expect(conferirDestravamento(t, DONO, SEGREDO, AGORA)).toBe(
      "destravamento de outro escritorio",
    );
  });

  it("recusa destravamento de outra pessoa", () => {
    const t = emitirDestravamento({ ...DONO, usuarioId: "usr-2" }, SEGREDO, AGORA);
    expect(conferirDestravamento(t, DONO, SEGREDO, AGORA)).toBe(
      "destravamento de outra pessoa",
    );
  });

  // Trocar a senha e o que se faz quando alguem sai do escritorio: se o
  // destravamento dele sobrevivesse, a troca nao serviria para nada.
  it("cai quando a senha de administracao muda", () => {
    const t = emitirDestravamento(DONO, SEGREDO, AGORA);
    const depois = { ...DONO, marca: marcaDaSenha("$2a$12$senhanova") };
    expect(conferirDestravamento(t, depois, SEGREDO, AGORA)).toBe(
      "a senha de administracao mudou",
    );
  });

  it("vence sozinho", () => {
    const t = emitirDestravamento(DONO, SEGREDO, AGORA);
    const quase = new Date(AGORA.getTime() + (MINUTOS_DESTRAVADO - 1) * 60_000);
    const passou = new Date(AGORA.getTime() + (MINUTOS_DESTRAVADO + 1) * 60_000);
    expect(conferirDestravamento(t, DONO, SEGREDO, quase)).toBeNull();
    expect(conferirDestravamento(t, DONO, SEGREDO, passou)).toBe(
      "destravamento vencido",
    );
  });

  it("recusa lixo", () => {
    for (const lixo of ["", "a.b.c", "a.b.c.d.e.f", "....", "x"]) {
      expect(conferirDestravamento(lixo, DONO, SEGREDO, AGORA)).not.toBeNull();
    }
  });
});

describe("exigencia da senha", () => {
  it("recusa curta demais e sem numero", () => {
    expect(senhaAceitavel("a1")).toContain(String(MINIMO_DE_CARACTERES));
    expect(senhaAceitavel("somenteletras")).toContain("letras e numeros");
    expect(senhaAceitavel("123456789012")).toContain("letras e numeros");
  });

  it("aceita senha razoavel", () => {
    expect(senhaAceitavel("roma2026forte")).toBeNull();
  });
});
