import { describe, expect, it } from "vitest";
import { formatarLinha, lerLinhaDigitavel } from "../src/lib/boleto-da-conta";

const BOLETO = "00190000090312345678901234567890112340000015000"; // 47
const CONVENIO = "836200000015234500481000123456789012345678901234"; // 48

describe("linha digitavel da conta", () => {
  it("aceita boleto (47) e convenio (48), com ou sem mascara", () => {
    expect(lerLinhaDigitavel(BOLETO)).toEqual({ ok: true, digitos: BOLETO, tipo: "BOLETO" });
    expect(lerLinhaDigitavel(CONVENIO)).toEqual({ ok: true, digitos: CONVENIO, tipo: "CONVENIO" });
    expect(lerLinhaDigitavel(formatarLinha(BOLETO))).toEqual({ ok: true, digitos: BOLETO, tipo: "BOLETO" });
    expect(lerLinhaDigitavel(formatarLinha(CONVENIO))).toEqual({ ok: true, digitos: CONVENIO, tipo: "CONVENIO" });
  });

  it("recusa linha pela metade dizendo quantos digitos vieram", () => {
    const r = lerLinhaDigitavel(BOLETO.slice(0, 40));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("40 dígitos");
    expect(lerLinhaDigitavel(BOLETO + "12").ok).toBe(false);
  });

  it("recusa vazio e o que tem letra", () => {
    expect(lerLinhaDigitavel("").ok).toBe(false);
    expect(lerLinhaDigitavel(null).ok).toBe(false);
    expect(lerLinhaDigitavel(`pix ${BOLETO}`).ok).toBe(false);
  });

  it("formata em blocos sem perder digito", () => {
    expect(formatarLinha(BOLETO).replace(/\D/g, "")).toBe(BOLETO);
    expect(formatarLinha(CONVENIO).replace(/\D/g, "")).toBe(CONVENIO);
    expect(formatarLinha(BOLETO)).toBe("00190.00009 03123.456789 01234.567890 1 12340000015000");
  });
});
