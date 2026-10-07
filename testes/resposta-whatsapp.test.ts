// A resposta do cliente no WhatsApp.
//
// O QUE ESTES TESTES PROTEGEM: a presenca do cliente na audiencia. Ler "nao
// posso" como confirmacao nao da erro nenhum — da uma cadeira vazia na frente
// do juiz, e quem responde por isso e o advogado.
import { describe, expect, it } from "vitest";
import { MODELOS } from "../src/lib/modelos-whatsapp";
import {
  aQualLembreteResponde,
  interpretar,
  normalizar,
  origemDaChave,
  textoDaResposta,
} from "../src/lib/resposta-whatsapp";

describe("o que a pessoa quis dizer", () => {
  it("confirma com o que as pessoas realmente escrevem", () => {
    for (const t of ["1", "sim", "Sim", "SIM", "s", "ok", "confirmo", "Confirmado", "estarei la", "beleza", "👍"]) {
      expect(interpretar(t), t).toBe("CONFIRMA");
    }
  });

  it("desmarca com o que as pessoas realmente escrevem", () => {
    for (const t of ["2", "nao", "Não", "NAO", "n", "nao posso", "nao vou poder", "desmarcar", "preciso remarcar", "👎"]) {
      expect(interpretar(t), t).toBe("DESMARCA");
    }
  });

  it("NEGACAO VENCE: 'nao confirmo' nunca vira confirmacao", () => {
    // A armadilha que este arquivo existe para evitar: uma busca por palavra
    // acha "confirmo" dentro de "nao confirmo" e marca a audiencia como
    // confirmada. O cliente nao aparece, e ninguem sabe por que.
    expect(interpretar("nao confirmo")).toBe("DESMARCA");
    expect(interpretar("nao vou confirmar")).toBe("DESMARCA");
    expect(interpretar("nao, nao posso ir")).toBe("DESMARCA");
  });

  it("mensagem comprida nunca confirma sozinha", () => {
    // Gente falando e para uma pessoa ler. O "quase sempre acerta" e que e o
    // problema: o erro restante e uma ausencia em audiencia.
    expect(
      interpretar("bom dia doutor tudo bem vou tentar chegar no horario combinado"),
    ).toBe("NAO_ENTENDI");
    expect(interpretar("entao eu vou ver com meu patrao se consigo sair mais cedo")).toBe(
      "NAO_ENTENDI",
    );
  });

  it("mas mensagem comprida com negacao vira desmarcacao, nao duvida", () => {
    // Uma ausencia que o escritorio precisa saber hoje nao pode ficar
    // guardada como "nao entendi".
    expect(interpretar("doutor eu nao vou conseguir ir nesse dia infelizmente")).toBe(
      "DESMARCA",
    );
  });

  it("sair da lista e pedido proprio, e vem antes de tudo", () => {
    for (const t of ["parar", "PARE", "sair", "stop", "descadastrar", "nao quero mais receber"]) {
      expect(interpretar(t), t).toBe("PARAR");
    }
  });

  it("'cancelar' sozinho desmarca o compromisso, nao a lista de avisos", () => {
    // Confundir as duas coisas tira do ar o aviso de quem so queria desmarcar
    // uma audiencia.
    expect(interpretar("cancelar")).toBe("DESMARCA");
    expect(interpretar("cancelar inscricao")).toBe("PARAR");
  });

  it("o que nao se entende fica para uma pessoa", () => {
    for (const t of ["", "   ", "quem e?", "???", "oi", "audio"]) {
      expect(interpretar(t), JSON.stringify(t)).toBe("NAO_ENTENDI");
    }
  });

  it("normaliza acento, emoji e pontuacao", () => {
    expect(normalizar("Não!! 👎")).toBe("nao");
    expect(normalizar("  SIM,  claro ")).toBe("sim claro");
  });
});

describe("o que o sistema responde", () => {
  const d = {
    nomeEscritorio: "Escritorio Modelo",
    telefoneDoEscritorio: "(77) 3611-0000",
    titulo: "Audiencia de instrucao",
    quando: "10/11/2026 as 14h",
  };

  it("confirmando, diz o que foi registrado", () => {
    expect(textoDaResposta("CONFIRMA", d)).toContain("confirmada");
    expect(textoDaResposta("CONFIRMA", d)).toContain("Audiencia de instrucao");
  });

  it("desmarcando, NAO promete que o compromisso foi desmarcado", () => {
    // Prometer em nome do escritorio e pior que nao responder: o cliente
    // deixaria de ir a uma audiencia que continua marcada.
    const texto = textoDaResposta("DESMARCA", d);
    expect(texto).toContain("NAO foi desmarcado");
  });

  it("TODA resposta diz que este numero nao atende, e para onde ligar", () => {
    // O numero e da plataforma e so notifica. Quem escrever aqui esperando o
    // advogado esperaria para sempre.
    for (const i of ["CONFIRMA", "DESMARCA", "NAO_ENTENDI"] as const) {
      const texto = textoDaResposta(i, d);
      expect(texto, i).toContain("nao recebe mensagens");
      expect(texto, i).toContain("(77) 3611-0000");
    }
  });

  it("sem telefone cadastrado, manda procurar o escritorio em vez de deixar buraco", () => {
    const texto = textoDaResposta("CONFIRMA", { nomeEscritorio: "Banca" });
    expect(texto).toContain("procure o escritorio");
    expect(texto).not.toContain("undefined");
    expect(texto).not.toContain("null");
  });

  it("sem compromisso ligado, fala em termos gerais e nao inventa", () => {
    const texto = textoDaResposta("CONFIRMA", { nomeEscritorio: "Banca" });
    expect(texto).toContain("o compromisso");
    expect(texto).not.toContain("undefined");
  });

  it("no que nao entendeu, ensina o atalho e NAO promete leitura", () => {
    // Prometer "alguem vai ler" num numero que nao atende e pior do que nao
    // responder nada.
    const texto = textoDaResposta("NAO_ENTENDI", d);
    expect(texto).toContain("responda 1");
    expect(texto).not.toContain("vai ler");
  });
});

describe("de qual lembrete veio", () => {
  it("le a chave do aviso do participante e a do usuario", () => {
    expect(origemDaChave("zap:participante:comp1:part9")).toEqual({
      compromissoId: "comp1",
      participanteId: "part9",
      usuarioId: null,
    });
    expect(origemDaChave("zap:lembrete:comp1:user7")).toEqual({
      compromissoId: "comp1",
      participanteId: null,
      usuarioId: "user7",
    });
  });

  it("le a chave com o marco da regua junto", () => {
    expect(origemDaChave("zap:participante:3d:comp1:part9")).toEqual({
      compromissoId: "comp1",
      participanteId: "part9",
      usuarioId: null,
    });
    expect(origemDaChave("zap:lembrete:1h:comp1:user7")?.usuarioId).toBe("user7");
  });

  it("chave de outro tipo de aviso nao vira compromisso", () => {
    expect(origemDaChave("zap:resumo:2026-10-07")).toBeNull();
    expect(origemDaChave("lembrete:comp1:user7")).toBeNull();
  });
});

describe("a qual lembrete a resposta responde", () => {
  const aviso = (id: string, escritorioId: string, minutos: number) => ({
    id,
    escritorioId,
    chave: `zap:participante:comp:${id}`,
    enviadoEm: new Date(Date.now() - minutos * 60_000),
  });

  it("do mesmo escritorio, pega o mais recente", () => {
    const r = aQualLembreteResponde([aviso("a", "e1", 600), aviso("b", "e1", 30)]);
    expect(r.tipo).toBe("UM");
    expect(r.tipo === "UM" && r.aviso.id).toBe("b");
  });

  it("DE DOIS ESCRITORIOS, NAO AGE", () => {
    // O mesmo telefone pode ser cliente de duas bancas da plataforma.
    // Responder "confirmada a sua audiencia" ao escritorio errado conta a um
    // escritorio que aquela pessoa e cliente do outro. Isso nao se desfaz.
    const r = aQualLembreteResponde([aviso("a", "e1", 60), aviso("b", "e2", 30)]);
    expect(r.tipo).toBe("AMBIGUO");
    expect(r.tipo === "AMBIGUO" && r.escritorios.sort()).toEqual(["e1", "e2"]);
  });

  it("aviso que nunca saiu nao conta como respondido", () => {
    const naoSaiu = { id: "x", escritorioId: "e1", chave: "zap:participante:c:x", enviadoEm: null };
    expect(aQualLembreteResponde([naoSaiu]).tipo).toBe("NENHUM");
  });

  it("sem candidato, nenhum", () => {
    expect(aQualLembreteResponde([]).tipo).toBe("NENHUM");
  });
});

describe("o contrato dos modelos aprovados na Meta", () => {
  // A ordem dos parametros e um contrato com a Meta. Trocar {{2}} por {{3}}
  // aqui sem trocar la faz o sistema mandar a hora no lugar do nome do
  // cliente — e ninguem percebe ate alguem receber.
  const modelos = Object.entries(MODELOS);

  it("cada {{n}} tem um parametro, e os numeros vao de 1 a N sem pular", () => {
    for (const [chave, m] of modelos) {
      const numeros = [...m.texto.matchAll(/\{\{(\d+)\}\}/g)].map((x) => Number(x[1]));
      expect(numeros.length, chave).toBe(m.parametros.length);
      expect(numeros, chave).toEqual(numeros.map((_, i) => i + 1));
    }
  });

  it("nenhum modelo termina em parametro — a Meta recusa", () => {
    for (const [chave, m] of modelos) {
      expect(m.texto.trim().endsWith("}}"), chave).toBe(false);
    }
  });

  it("todo modelo se apresenta e diz que o numero nao atende", () => {
    // O numero e da plataforma, nao da banca: quem recebe nao o conhece. Sem
    // o nome do escritorio e sem o telefone dele, a mensagem chega como numero
    // desconhecido falando de audiencia.
    for (const [chave, m] of modelos) {
      expect(m.texto, chave).toContain("nao recebe mensagens");
      expect(m.parametros, chave).toContain("telefone do escritorio");
      expect(m.parametros.some((p) => p.includes("escritorio")), chave).toBe(true);
    }
  });

  it("o telefone e sempre o ultimo parametro", () => {
    // E o que deixa avisos.ts acrescentar o telefone no fim de cada lista sem
    // ter de saber de que modelo se trata.
    for (const [chave, m] of modelos) {
      expect(m.parametros[m.parametros.length - 1], chave).toBe("telefone do escritorio");
    }
  });
});
