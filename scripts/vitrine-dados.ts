// Escritorio de demonstracao para as telas da vitrine.
//
//   npm run vitrine:dados
//
// Cria (ou refaz) o escritorio "modelo", com dados INVENTADOS, so para as
// imagens da pagina inicial. Nomes, numeros de processo e valores nao
// pertencem a ninguem: e material de vitrine, nao dado de cliente.
//
// Roda contra o banco local. Nunca apontar para producao.
import { prismaPlataforma, comEscritorio, semEscritorio } from "../src/lib/prisma";
import { definirModulos } from "../src/lib/contratacao";
import { modulosDoPlano } from "../src/lib/planos";
import { criarAssinatura } from "../src/lib/cobranca";
import { gerarHash } from "../src/lib/senhas";
import { numeroParaGravar } from "../src/lib/leitura-publicacao";

const SLUG = "modelo";
const SENHA = "Vitrine-2026-Modelo";
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

function daquiA(ms: number): Date {
  return new Date(Date.now() + ms);
}

const competenciaAtual = new Date().toISOString().slice(0, 7);

async function main() {
  if (process.env.DATABASE_URL?.includes("railway") || process.env.NODE_ENV === "production") {
    throw new Error("Este script e de demonstracao local. Nao rode contra producao.");
  }

  const antigo = await prismaPlataforma().escritorio.findUnique({ where: { slug: SLUG } });
  if (antigo) {
    await prismaPlataforma().escritorio.delete({ where: { id: antigo.id } });
    console.log("escritorio anterior removido");
  }

  const escritorio = await prismaPlataforma().escritorio.create({
    data: {
      slug: SLUG,
      nome: "Escritorio Modelo",
      status: "ATIVO",
      faixa: "ATE_3",
      corPrimaria: "#0B1F3B",
      corSecundaria: "#D4AF7C",
      cidade: "Salvador",
    },
  });

  await definirModulos(escritorio.id, modulosDoPlano("COMPLETO"), "ATE_3");
  await criarAssinatura(escritorio.id, 39_900, 0);

  await comEscritorio(escritorio.id, async (db) => {
    await db.usuario.create({
      data: semEscritorio({
        nome: "Helena Vasconcelos",
        email: "helena@modelo.adv.br",
        senhaHash: await gerarHash(SENHA),
        papel: "ADMIN",
        advogado: true,
      }),
    });

    const clientes = await Promise.all(
      [
        { nome: "Construtora Aurora Ltda", documento: "11.222.333/0001-81", telefone: "(71) 3000-1122" },
        { nome: "Maria Helena do Prado", documento: "529.982.247-25", telefone: "(71) 99000-2211" },
        { nome: "Fazenda Boa Vista S/A", documento: "45.987.112/0001-70", telefone: "(75) 3200-4455" },
        { nome: "Joaquim Ribeiro dos Santos", documento: "390.533.447-05", telefone: "(71) 98888-7766" },
      ].map((cliente) =>
        db.cliente.create({ data: semEscritorio({ ...cliente, email: null }) })
      )
    );

    const processos = await Promise.all(
      [
        { numero: "0801234-56.2026.8.05.0001", tribunal: "TJBA", vara: "3a Vara Civel", area: "Civel", clienteId: clientes[0].id },
        { numero: "0005678-90.2026.5.05.0003", tribunal: "TRT5", vara: "3a Vara do Trabalho", area: "Trabalhista", clienteId: clientes[1].id },
        { numero: "1002345-67.2026.4.01.3300", tribunal: "TRF1", vara: "2a Vara Federal", area: "Agrario", clienteId: clientes[2].id },
      ].map((processo) =>
        db.processo.create({
          data: semEscritorio({ ...processo, numero: numeroParaGravar(processo.numero) }),
        })
      )
    );

    await db.compromisso.createMany({
      data: [
        {
          titulo: "Audiencia de instrucao e julgamento",
          tipo: "AUDIENCIA",
          inicio: daquiA(5 * HORA),
          local: "Forum Ruy Barbosa — sala 304",
          processoId: processos[0].id,
        },
        {
          titulo: "Prazo: contestacao",
          tipo: "PRAZO",
          inicio: daquiA(9 * HORA),
          processoId: processos[1].id,
        },
        {
          titulo: "Reuniao com o cliente sobre acordo",
          tipo: "COMPROMISSO",
          inicio: daquiA(28 * HORA),
          local: "Escritorio",
          processoId: processos[2].id,
        },
        {
          titulo: "Juntar procuracao atualizada",
          tipo: "TAREFA",
          inicio: daquiA(2 * DIA),
          processoId: processos[0].id,
        },
      ].map((compromisso) => semEscritorio(compromisso)),
    });

    await db.oabMonitorada.createMany({
      data: [
        { numero: "41235", uf: "BA", nomeAdvogado: "Helena Vasconcelos", ativo: true, ultimaCaptura: daquiA(-2 * HORA) },
        { numero: "52118", uf: "BA", nomeAdvogado: "Rafael Menezes", ativo: true, ultimaCaptura: daquiA(-2 * HORA) },
      ].map((oab) => semEscritorio(oab)),
    });

    const publicacoes = [
      {
        idExterno: "vitrine-1",
        numeroProcesso: numeroParaGravar("0005678-90.2026.5.05.0003"),
        processoId: processos[1].id,
        tribunal: "TRT5",
        orgao: "3a Vara do Trabalho de Salvador",
        tipoComunicacao: "Intimacao",
        texto:
          "Intimada a parte reclamada para, no prazo de 15 (quinze) dias, apresentar contestacao e documentos, sob pena de revelia e confissao quanto a materia de fato, nos termos do art. 844 da CLT.",
        dataDisponibilizacao: daquiA(-3 * HORA),
        urgente: true,
        prazoDias: 15,
        oab: "41235/BA",
        lida: false,
      },
      {
        idExterno: "vitrine-2",
        numeroProcesso: numeroParaGravar("0801234-56.2026.8.05.0001"),
        processoId: processos[0].id,
        tribunal: "TJBA",
        orgao: "3a Vara Civel de Salvador",
        tipoComunicacao: "Despacho",
        texto:
          "Designo audiencia de instrucao e julgamento para o dia 30/09/2026, as 14h30, devendo as partes apresentar rol de testemunhas no prazo comum de 10 (dez) dias.",
        dataDisponibilizacao: daquiA(-5 * HORA),
        urgente: false,
        prazoDias: 10,
        oab: "41235/BA",
        lida: false,
      },
      {
        idExterno: "vitrine-3",
        numeroProcesso: numeroParaGravar("1002345-67.2026.4.01.3300"),
        processoId: processos[2].id,
        tribunal: "TRF1",
        orgao: "2a Vara Federal de Salvador",
        tipoComunicacao: "Sentenca",
        texto:
          "Julgo procedente o pedido para declarar a nulidade da clausula de reajuste do contrato de credito rural, condenando a parte re a restituir os valores pagos a maior, com correcao monetaria desde cada desembolso.",
        dataDisponibilizacao: daquiA(-28 * HORA),
        urgente: false,
        prazoDias: null,
        oab: "52118/BA",
        lida: true,
      },
    ];

    for (const publicacao of publicacoes) {
      const gravada = await db.publicacao.create({ data: semEscritorio(publicacao) });
      if (publicacao.idExterno !== "vitrine-3") {
        await db.analiseIA.create({
          data: semEscritorio({
            publicacaoId: gravada.id,
            tipo: "ANALISE_PUBLICACAO",
            modelo: "demonstracao",
            tokensEntrada: 0,
            tokensSaida: 0,
            resultado:
              publicacao.idExterno === "vitrine-1"
                ? "O QUE ACONTECEU: a reclamada foi intimada para contestar.\n\nO QUE FAZER: protocolar contestacao com documentos e rol de testemunhas.\n\nPRAZO: 15 dias corridos a contar da publicacao, com risco de revelia.\n\nATENCAO: confira a data de disponibilizacao nos autos antes de lancar o prazo."
                : "O QUE ACONTECEU: audiencia de instrucao designada para 30/09/2026, as 14h30.\n\nO QUE FAZER: apresentar rol de testemunhas e confirmar a presenca do cliente.\n\nPRAZO: 10 dias, comum as partes.\n\nATENCAO: prazo comum nao se suspende por pedido de uma das partes.",
          }),
        });
      }
    }

    await db.cobranca.createMany({
      data: [
        {
          clienteId: clientes[0].id,
          processoId: processos[0].id,
          descricao: "Honorarios contratuais — 2a parcela",
          valorCentavos: 480_000,
          vencimento: daquiA(-6 * DIA),
          forma: "BOLETO",
          status: "VENCIDA",
          idNoAsaas: "demo-1",
        },
        {
          clienteId: clientes[1].id,
          descricao: "Consulta e parecer trabalhista",
          valorCentavos: 120_000,
          vencimento: daquiA(4 * DIA),
          forma: "PIX",
          status: "ABERTA",
          idNoAsaas: "demo-2",
        },
        {
          clienteId: clientes[2].id,
          processoId: processos[2].id,
          descricao: "Honorarios — acao revisional de credito rural",
          valorCentavos: 950_000,
          vencimento: daquiA(-20 * DIA),
          forma: "BOLETO",
          status: "PAGA",
          idNoAsaas: "demo-3",
          pagoEm: daquiA(-18 * DIA),
          valorPagoCentavos: 950_000,
        },
      ].map((cobranca) => semEscritorio(cobranca)),
    });

    await db.notaFiscal.createMany({
      data: [
        {
          clienteId: clientes[2].id,
          serie: "1",
          numero: 128,
          descricao: "Honorarios advocaticios — acao revisional",
          valorCentavos: 950_000,
          status: "EMITIDA",
          chaveAcesso: "29260500011222333000181550010000001281234567890",
          emitidaEm: daquiA(-18 * DIA),
        },
        {
          clienteId: clientes[0].id,
          serie: "1",
          numero: 129,
          descricao: "Honorarios contratuais — 2a parcela",
          valorCentavos: 480_000,
          status: "RASCUNHO",
        },
      ].map((nota) => semEscritorio(nota)),
    });

    await db.lancamento.createMany({
      data: [
        { tipo: "RECEITA", descricao: "Honorarios — Fazenda Boa Vista", valorCentavos: 950_000, competencia: competenciaAtual, pagoEm: daquiA(-18 * DIA) },
        { tipo: "DESPESA", descricao: "Custas processuais", valorCentavos: 34_500, competencia: competenciaAtual, pagoEm: daquiA(-12 * DIA) },
        { tipo: "DESPESA", descricao: "Aluguel do escritorio", valorCentavos: 280_000, competencia: competenciaAtual, pagoEm: daquiA(-10 * DIA) },
      ].map((lancamento) => semEscritorio(lancamento)),
    });
  });

  console.log(`escritorio ${SLUG} pronto`);
  console.log(`entrar em http://${SLUG}.birdjud.com.br:3000/login`);
  console.log(`helena@modelo.adv.br / ${SENHA}`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prismaPlataforma().$disconnect());
