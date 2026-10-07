// A resposta do cliente no WhatsApp.
//
// O QUE ESTES TESTES PROTEGEM: a presenca do cliente na audiencia. Ler "nao
// posso" como confirmacao nao da erro nenhum — da uma cadeira vazia na frente
// do juiz, e quem responde por isso e o advogado.
import { describe, expect, it } from "vitest";
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
  const d = { nomeEscritorio: "Escritorio Modelo", titulo: "Audiencia de instrucao", quando: "10/11/2026 as 14h" };

  it("confirmando, diz o que foi registrado", () => {
    expect(textoDaResposta("CONFIRMA", d)).toContain("confirmada");
    expect(textoDaResposta("CONFIRMA", d)).toContain("Audiencia de instrucao");
  });

  it("desmarcando, NAO promete que o compromisso foi desmarcado", () => {
    // Prometer em nome do escritorio e pior que nao responder: o cliente
    // deixaria de ir a uma audiencia que continua marcada.
    const texto = textoDaResposta("DESMARCA", d);
    expect(texto).toContain("NAO foi desmarcado");
    expect(texto).toContain("Alguem do escritorio vai falar");
  });

  it("sem compromisso ligado, fala em termos gerais e nao inventa", () => {
    const texto = textoDaResposta("CONFIRMA", { nomeEscritorio: "Banca" });
    expect(texto).toContain("o compromisso");
    expect(texto).not.toContain("undefined");
  });

  it("no que nao entendeu, ensina o atalho", () => {
    expect(textoDaResposta("NAO_ENTENDI", d)).toContain("responda 1");
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
