// "Entrar no meu escritorio".
//
// O QUE ESTES TESTES PROTEGEM: uma tela que manda o navegador para onde o
// texto digitado disser e um redirecionamento aberto — e pagina de login
// falsa convincente se monta exatamente assim, levando junto a confianca que
// a pessoa tem no nosso endereco. Por isso metade dos testes aqui nao e sobre
// funcionar: e sobre NAO ir para onde nao e nosso.
import { describe, expect, it } from "vitest";
import { enderecoDeEntrada, slugDigitado } from "../src/lib/entrada";

const DOM = "birdjud.com.br";

describe("o que a pessoa digita", () => {
  it("o rotulo direto", () => {
    expect(slugDigitado("advocaciaroma", DOM)).toBe("advocaciaroma");
  });

  it("o nome do escritório, com espaço e maiuscula", () => {
    expect(slugDigitado("Advocacia Roma", DOM)).toBe("advocaciaroma");
    expect(slugDigitado("  ADVOCACIA ROMA  ", DOM)).toBe("advocaciaroma");
  });

  it("nome com acento", () => {
    expect(slugDigitado("Advocacia Araújo", DOM)).toBe("advocaciaaraujo");
  });

  it("o endereço inteiro, como vem de um e-mail antigo", () => {
    for (const texto of [
      "advocaciaroma.birdjud.com.br",
      "https://advocaciaroma.birdjud.com.br",
      "https://advocaciaroma.birdjud.com.br/login",
      "http://advocaciaroma.birdjud.com.br/publicacoes?x=1",
      "ADVOCACIAROMA.BIRDJUD.COM.BR",
      "advocaciaroma.birdjud.com.br.",
      "advocaciaroma.birdjud.com.br:443",
    ]) {
      expect(slugDigitado(texto, DOM), texto).toBe("advocaciaroma");
    }
  });

  it("monta o endereço de login com o NOSSO domínio", () => {
    expect(enderecoDeEntrada("Advocacia Roma", DOM)).toBe(
      "https://advocaciaroma.birdjud.com.br/login",
    );
  });
});

describe("para onde NAO vai", () => {
  // O ataque: um link pronto que leva a pessoa para fora, com a nossa cara.
  it("recusa endereço de outro domínio", () => {
    for (const texto of [
      "site-falso.com",
      "https://site-falso.com",
      "https://site-falso.com/login",
      "birdjud.com.br.site-falso.com",
      "advocaciaroma.birdjud.com.br.site-falso.com",
      "https://site-falso.com/birdjud.com.br",
    ]) {
      expect(slugDigitado(texto, DOM), texto).toBeNull();
      expect(enderecoDeEntrada(texto, DOM), texto).toBeNull();
    }
  });

  // "usuario@host" no endereco: o navegador vai para o HOST, e quem le ve o
  // comeco. E o truque classico de disfarcar o destino.
  it("não se engana com usuário antes do arroba", () => {
    expect(slugDigitado("https://advocaciaroma.birdjud.com.br@site-falso.com", DOM)).toBeNull();
  });

  it("recusa barra invertida, que alguns navegadores leem como barra", () => {
    expect(slugDigitado("https://site-falso.com\\@birdjud.com.br", DOM)).toBeNull();
  });

  it("recusa o próprio domínio da plataforma", () => {
    expect(slugDigitado("birdjud.com.br", DOM)).toBeNull();
    expect(slugDigitado("https://birdjud.com.br/", DOM)).toBeNull();
  });

  it("recusa os subdominios reservados", () => {
    for (const r of ["www", "app", "api", "admin", "painel"]) {
      expect(slugDigitado(r, DOM), r).toBeNull();
      expect(slugDigitado(`${r}.birdjud.com.br`, DOM), r).toBeNull();
    }
  });

  it("recusa dois niveis de subdomínio", () => {
    expect(slugDigitado("a.b.birdjud.com.br", DOM)).toBeNull();
  });

  it("recusa rotulo malformado", () => {
    for (const texto of ["", "   ", "-comeca-com-hifen", "termina-com-hifen-", "a".repeat(64), "com/barra", "com_sublinhado"]) {
      expect(slugDigitado(texto, DOM), JSON.stringify(texto)).toBeNull();
    }
  });

  it("não explode com entrada estranha", () => {
    expect(slugDigitado("://", DOM)).toBeNull();
    expect(slugDigitado("@@@", DOM)).toBeNull();
    expect(slugDigitado("...", DOM)).toBeNull();
  });
});
