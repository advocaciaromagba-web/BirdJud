// De onde veio a requisicao.
//
// POR QUE ISTO TEM TESTE PROPRIO: todo teto de tentativa do sistema e contado
// por origem — login, cadastro publico, redefinicao de senha, destravamento da
// administracao, chamadas de IA que gastam dinheiro. Se quem ataca escolhe a
// propria origem, todos esses tetos caem ao mesmo tempo, e nenhum deles
// reclama. O estrago nao aparece como erro: aparece como senha descoberta.
import { afterEach, describe, expect, it } from "vitest";
import {
  SEM_ORIGEM,
  chaveDeOrigem,
  ehPrivado,
  ipDeQuemChamou,
} from "../src/lib/origem";

const antes = process.env.ATRAS_DO_CLOUDFLARE;
afterEach(() => {
  if (antes === undefined) delete process.env.ATRAS_DO_CLOUDFLARE;
  else process.env.ATRAS_DO_CLOUDFLARE = antes;
});

function com(cabecalhos: Record<string, string>) {
  return new Headers(cabecalhos);
}

describe("o cliente nao escolhe a propria origem", () => {
  // O ataque exato que isto fecha: o cabecalho que o visitante manda fica a
  // ESQUERDA do que a borda acrescenta.
  it("ignora o endereco forjado e fica com o que a borda escreveu", () => {
    expect(
      ipDeQuemChamou(com({ "x-forwarded-for": "1.2.3.4, 200.200.200.200" })),
    ).toBe("200.200.200.200");
  });

  it("forjar varios tambem nao adianta", () => {
    expect(
      ipDeQuemChamou(
        com({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.9.9.9, 200.200.200.200" }),
      ),
    ).toBe("200.200.200.200");
  });

  it("trocar o forjado a cada tentativa nao gera chave nova", () => {
    // Era assim que cinco tentativas viravam cinco tetos.
    const chaves = new Set<string>();
    for (let i = 0; i < 5; i++) {
      chaves.add(chaveDeOrigem(com({ "x-forwarded-for": `9.9.9.${i}, 200.200.200.200` })));
    }
    expect(chaves.size).toBe(1);
    expect([...chaves][0]).toBe("200.200.200.200");
  });

  it("lixo no cabecalho nao vira chave", () => {
    expect(
      ipDeQuemChamou(com({ "x-forwarded-for": "nao-sou-ip, 200.200.200.200" })),
    ).toBe("200.200.200.200");
    // Sem nada legivel, cai na chave unica — e nao em uma chave por lixo.
    expect(chaveDeOrigem(com({ "x-forwarded-for": "<script>, abc" }))).toBe(
      SEM_ORIGEM,
    );
  });
});

describe("o caminho normal continua funcionando", () => {
  it("um visitante direto e lido como ele mesmo", () => {
    expect(ipDeQuemChamou(com({ "x-forwarded-for": "200.200.200.200" }))).toBe(
      "200.200.200.200",
    );
  });

  it("aceita IPv6", () => {
    expect(ipDeQuemChamou(com({ "x-forwarded-for": "2804:14d:1::25" }))).toBe(
      "2804:14d:1::25",
    );
  });

  it("usa x-real-ip quando nao ha lista", () => {
    expect(ipDeQuemChamou(com({ "x-real-ip": "200.200.200.200" }))).toBe(
      "200.200.200.200",
    );
  });

  it("sem cabecalho nenhum, nao chuta", () => {
    expect(ipDeQuemChamou(com({}))).toBeNull();
    expect(chaveDeOrigem(com({}))).toBe(SEM_ORIGEM);
  });

  it("le tambem o objeto simples que o NextAuth entrega", () => {
    expect(
      ipDeQuemChamou({ "x-forwarded-for": "1.2.3.4, 200.200.200.200" }),
    ).toBe("200.200.200.200");
    expect(ipDeQuemChamou(undefined)).toBeNull();
  });
});

describe("salto interno nao e visitante", () => {
  // Se a infraestrutura puser um endereco privado por ultimo e nos ficassemos
  // com ele, TODO MUNDO dividiria a mesma chave: o primeiro que errasse a
  // senha trancaria o sistema para os outros. Isso e pior que o buraco.
  it("pula o salto interno e acha o visitante", () => {
    expect(
      ipDeQuemChamou(com({ "x-forwarded-for": "1.2.3.4, 200.200.200.200, 10.0.0.7" })),
    ).toBe("200.200.200.200");
  });

  it("reconhece as faixas privadas", () => {
    for (const p of ["10.0.0.1", "192.168.1.1", "172.16.0.1", "172.31.255.1", "127.0.0.1", "169.254.1.1", "100.64.0.1", "::1", "fd00::1"]) {
      expect(ehPrivado(p), p).toBe(true);
    }
    for (const p of ["200.200.200.200", "8.8.8.8", "172.32.0.1", "172.15.0.1", "2804:14d::1"]) {
      expect(ehPrivado(p), p).toBe(false);
    }
  });

  it("so havendo salto interno, usa o que tem em vez de desistir", () => {
    expect(ipDeQuemChamou(com({ "x-forwarded-for": "10.0.0.7" }))).toBe("10.0.0.7");
  });
});

describe("atras do Cloudflare", () => {
  it("solto na internet, CF-Connecting-IP e so texto de visitante", () => {
    delete process.env.ATRAS_DO_CLOUDFLARE;
    expect(
      ipDeQuemChamou(
        com({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "200.200.200.200" }),
      ),
    ).toBe("200.200.200.200");
  });

  it("atras dela, o cabecalho dela manda", () => {
    process.env.ATRAS_DO_CLOUDFLARE = "1";
    expect(
      ipDeQuemChamou(
        com({ "cf-connecting-ip": "200.200.200.200", "x-forwarded-for": "1.2.3.4, 172.16.0.9" }),
      ),
    ).toBe("200.200.200.200");
  });

  it("atras dela, cabecalho dela invalido nao derruba a leitura", () => {
    process.env.ATRAS_DO_CLOUDFLARE = "1";
    expect(
      ipDeQuemChamou(com({ "cf-connecting-ip": "lixo", "x-forwarded-for": "1.2.3.4, 200.200.200.200" })),
    ).toBe("200.200.200.200");
  });
});
