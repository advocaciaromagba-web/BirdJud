import { NextResponse } from "next/server";
import { ExclusaoRecusada, encerrarEscritorio, excluirEscritorio, reativarEscritorio } from "@/lib/encerramento";
import { PRAZO_DE_RETENCAO_DIAS } from "@/lib/juridico";
import { z } from "zod";
import { enfileirar } from "@/lib/fila";
import { comEscritorio, prismaPlataforma, semEscritorio } from "@/lib/prisma";
import {
  exigirOperador,
  registrarAcessoSuporte,
  SemOperador,
} from "@/lib/plataforma";
import { aplicarRegua } from "@/lib/cobranca";
import { mesesDaFatura } from "@/lib/cobranca-plataforma";
import { percentualEmTexto } from "@/lib/cobranca";
import { tabelaVigente } from "@/lib/tabela-de-precos";
import { CupomInvalido, aplicarCupom, removerCupom } from "@/lib/cupons";
import { FAIXAS } from "@/lib/faixas";
import { MODULOS } from "@/lib/modulos";
import { contaMontada, modulosDoPlano, PLANO, PLANOS } from "@/lib/planos";
import {
  ajustarFranquias,
  definirModulo,
  definirModulos,
} from "@/lib/contratacao";
import { ehFaixa, type Faixa } from "@/lib/faixas";
import type { Modulo } from "@/lib/catalogo";
import { documentoValido, formatarDocumento } from "@/lib/documentos";

const acao = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("faixa"), faixa: z.enum(FAIXAS) }),
  z.object({
    acao: z.literal("modulo"),
    modulo: z.enum(MODULOS),
    ativo: z.boolean(),
  }),
  z.object({ acao: z.literal("plano"), plano: z.enum(PLANOS) }),
  z.object({ acao: z.literal("regua") }),
  // Cortesia: usa sem pagar, por tempo indeterminado (ver cobranca.ts).
  // Com "ate", e isencao por prazo: a regua volta a cobrar sozinha depois.
  z.object({
    acao: z.literal("cortesia"),
    ligar: z.boolean(),
    motivo: z.string().trim().max(300).optional(),
    ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  // Cupom de desconto aplicado pelo operador (ou retirado).
  z.object({ acao: z.literal("cupom"), codigo: z.string().trim().min(1).max(40) }),
  z.object({ acao: z.literal("removerCupom") }),
  // Exclusao definitiva: endereco digitado e motivo (encerramento.ts).
  z.object({ acao: z.literal("excluir"), confirmacao: z.string().max(80), motivo: z.string().max(300) }),
  // Encerrar interrompe o servico e comeca a contar o prazo de retencao
  // (encerramento.ts); reativar desfaz enquanto o prazo corre.
  z.object({ acao: z.literal("encerrar"), motivo: z.string().trim().min(3).max(300) }),
  z.object({ acao: z.literal("reativar") }),
  // Busca dos processos das OABs no DJEN (12 meses) agora, sem esperar a
  // captura da madrugada. So poe o trabalho na fila.
  z.object({ acao: z.literal("processos"), refazer: z.boolean().optional() }),
  z.object({ acao: z.literal("nuvem") }),
  z.object({ acao: z.literal("ciclo"), ciclo: z.enum(["MENSAL", "TRIMESTRAL", "ANUAL"]) }),
  // CNPJ pelo console: sem ele o meio de pagamento recusa emitir a fatura, e
  // o escritorio ficaria devendo uma cobranca que nunca lhe foi apresentada.
  // O caminho normal e o proprio escritorio preencher em Administracao; esta
  // acao existe para o suporte destravar quem ja esbarrou.
  z.object({ acao: z.literal("cnpj"), cnpj: z.string().max(20) }),
  // Valor fechado da mensalidade (preco negociado). Zero volta a valer a
  // tabela. Vale para as faturas seguintes; fatura ja gerada nao muda.
  z.object({ acao: z.literal("valor"), valorCentavos: z.number().int().min(0).max(10_000_000) }),
  // Encerrar o teste agora: o escritorio que quer comecar a pagar antes dos
  // 14 dias. A fatura sai na proxima regua (ou na hora, com "regua").
  z.object({ acao: z.literal("encerrarTeste") }),
]);

function tratar(erro: unknown) {
  if (erro instanceof SemOperador) {
    return NextResponse.json({ erro: erro.message }, { status: erro.status });
  }
  console.error(erro);
  return NextResponse.json({ erro: "Erro interno." }, { status: 500 });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const operador = await exigirOperador();
    const corpo = acao.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });
    }

    const escritorio = await prismaPlataforma().escritorio.findUnique({
      where: { id: (await params).id },
      select: { id: true, nome: true, faixa: true },
    });
    if (!escritorio) {
      return NextResponse.json(
        { erro: "Escritório não encontrado." },
        { status: 404 },
      );
    }

    // A faixa gravada manda no preco e na franquia. Valor estranho no banco
    // nao pode derrubar a acao: cai para a menor, como em faixas.ts.
    const faixaAtual: Faixa = ehFaixa(escritorio.faixa)
      ? escritorio.faixa
      : "ATE_3";

    // Toda acao do operador sobre um escritorio fica registrada.
    await registrarAcessoSuporte(
      operador.operadorId,
      escritorio.id,
      `Ação no painel: ${corpo.data.acao}`,
    );

    if (corpo.data.acao === "faixa") {
      await prismaPlataforma().escritorio.update({
        where: { id: escritorio.id },
        data: { faixa: corpo.data.faixa },
      });
      // A franquia de cada modulo e da faixa: mudar de faixa sem reescrever
      // deixaria o escritorio que cresceu pagando excedente do tamanho antigo.
      await ajustarFranquias(escritorio.id, corpo.data.faixa);
      return NextResponse.json({
        detalhe: `Faixa alterada para ${corpo.data.faixa}.`,
      });
    }

    if (corpo.data.acao === "cnpj") {
      // Conferido aqui tambem: digito errado so apareceria como recusa do
      // provedor no dia da primeira fatura.
      if (!documentoValido(corpo.data.cnpj)) {
        return NextResponse.json(
          { erro: "O CNPJ informado não fecha o dígito verificador." },
          { status: 400 },
        );
      }
      const formatado = formatarDocumento(corpo.data.cnpj);
      await prismaPlataforma().escritorio.update({
        where: { id: escritorio.id },
        data: { cnpj: formatado },
      });
      return NextResponse.json({ detalhe: `CNPJ gravado: ${formatado}.` });
    }

    if (corpo.data.acao === "modulo") {
      const { modulo, ativo } = corpo.data;
      await definirModulo(escritorio.id, modulo, ativo, faixaAtual);
      return NextResponse.json({
        detalhe: `${modulo} ${ativo ? "contratado" : "desligado"}.`,
      });
    }

    if (corpo.data.acao === "plano") {
      const doPlano = modulosDoPlano(corpo.data.plano);
      const conta = contaMontada(doPlano, faixaAtual, await tabelaVigente());
      const contratados = new Set<Modulo>(
        conta.modulos.map((linha) => linha.modulo),
      );

      // Aplicar plano e dizer o conjunto inteiro, nao acrescentar: o que nao
      // esta no plano sai. Senao "mudar para o Essencial" deixaria ligado o
      // que veio de antes, e o escritorio continuaria usando o que nao paga.
      await comEscritorio(escritorio.id, async (db) => {
        for (const modulo of MODULOS) {
          if (modulo === "NUCLEO") continue;
          const ativo = contratados.has(modulo);
          await db.moduloContratado.upsert({
            where: {
              escritorioId_modulo: { escritorioId: escritorio.id, modulo },
            },
            create: semEscritorio({ modulo, ativo }),
            update: { ativo },
          });
        }
      });

      return NextResponse.json({
        detalhe:
          `Plano ${PLANO[corpo.data.plano].rotulo} aplicado. ` +
          `Mensalidade pela tabela de hoje: ${(conta.totalCentavos / 100).toFixed(2)}. ` +
          "O valor da assinatura não foi alterado.",
      });
    }

    if (corpo.data.acao === "encerrar") {
      await encerrarEscritorio(escritorio.id);
      // Assinatura cancelada junto: nenhuma fatura nova, e o painel tira da carteira.
      await prismaPlataforma().assinatura.updateMany({
        where: { escritorioId: escritorio.id, canceladaEm: null },
        data: { canceladaEm: new Date() },
      });
      // Fatura aberta que nunca saiu para o meio de pagamento morre aqui:
      // ninguem vai cobra-la, e aberta ela viraria "atraso" no painel. A ja
      // emitida fica como esta — cancelar so aqui deixaria o boleto vivo no
      // provedor —, e a resposta diz quantas sao.
      const canceladas = await prismaPlataforma().fatura.updateMany({
        where: { escritorioId: escritorio.id, status: "ABERTA", idExterno: null },
        data: { status: "CANCELADA" },
      });
      const emitidas = await prismaPlataforma().fatura.count({
        where: { escritorioId: escritorio.id, status: "ABERTA" },
      });
      await registrarAcessoSuporte(operador.operadorId, escritorio.id, `Encerrado: ${corpo.data.motivo}`);
      return NextResponse.json({
        detalhe:
          `Escritório encerrado. Os dados ficam ${PRAZO_DE_RETENCAO_DIAS} dias para exportação e depois são apagados.` +
          (canceladas.count ? ` ${canceladas.count} fatura(s) não emitida(s) cancelada(s).` : "") +
          (emitidas ? ` Atenção: ${emitidas} fatura(s) já emitida(s) no meio de pagamento continuam abertas — cancele no provedor.` : ""),
      });
    }

    if (corpo.data.acao === "processos") {
      // Refazer: busca de novo o ano das OABs ja buscadas. E idempotente —
      // processo existente so tem o andamento atualizado.
      if (corpo.data.refazer) {
        await comEscritorio(escritorio.id, (db) =>
          db.oabMonitorada.updateMany({ where: { ativo: true }, data: { processosImportadosEm: null } }),
        );
      }
      const oabs = await comEscritorio(escritorio.id, (db) =>
        db.oabMonitorada.count({ where: { ativo: true, processosImportadosEm: null } }),
      );
      if (oabs === 0) {
        return NextResponse.json({ detalhe: "Nenhuma OAB esperando a busca dos processos." });
      }
      await enfileirar("IMPORTAR_PROCESSOS", escritorio.id);
      return NextResponse.json({ detalhe: `Busca dos processos de ${oabs} OAB(s) na fila.` });
    }

    if (corpo.data.acao === "ciclo") {
      // Mensal ou anual (10% de desconto). Passar para o anual: a fatura de
      // 12 meses sai na proxima regua. Voltar ao mensal: o ano ja pago segue
      // valendo ate acabar (anualAte fica), e so depois volta a fatura mensal.
      const assinatura = await prismaPlataforma().assinatura.findUnique({ where: { escritorioId: escritorio.id } });
      if (!assinatura) return NextResponse.json({ erro: "Escritório sem assinatura." }, { status: 400 });
      if (corpo.data.ciclo !== assinatura.ciclo) {
        // O periodo faturado conta como pago (a regua nao cobra de novo ate
        // ele acabar). Com a fatura do periodo ainda em aberto, trocar de
        // ciclo deixaria o escritorio sem pagar nenhuma das duas.
        const abertas = await prismaPlataforma().fatura.findMany({
          where: { escritorioId: escritorio.id, status: "ABERTA" },
          select: { detalhe: true },
        });
        if (abertas.some((f) => mesesDaFatura(f.detalhe) > 1)) {
          return NextResponse.json(
            { erro: "Há fatura de período (anual ou trimestral) em aberto. Ela precisa ser paga ou cancelada (no Asaas e aqui) antes de trocar o ciclo." },
            { status: 409 },
          );
        }
      }
      await prismaPlataforma().assinatura.update({
        where: { escritorioId: escritorio.id },
        data: { ciclo: corpo.data.ciclo },
      });
      await registrarAcessoSuporte(operador.operadorId, escritorio.id, `Ciclo da assinatura: ${corpo.data.ciclo}`);
      const tabela = await tabelaVigente();
      return NextResponse.json({
        detalhe:
          corpo.data.ciclo === "ANUAL"
            ? `Assinatura anual: a fatura de 12 meses, com ${percentualEmTexto(tabela.descontoAnual)} de desconto, sai na próxima régua (depois do período já pago, se houver).`
            : corpo.data.ciclo === "TRIMESTRAL"
              ? `Assinatura trimestral: a fatura de 3 meses, com ${percentualEmTexto(tabela.descontoTrimestral)} de desconto, sai na próxima régua (depois do período já pago, se houver).`
              : "Assinatura mensal (depois do período já pago, se houver).",
      });
    }

    if (corpo.data.acao === "valor") {
      const assinatura = await prismaPlataforma().assinatura.findUnique({ where: { escritorioId: escritorio.id } });
      if (!assinatura) return NextResponse.json({ erro: "Escritório sem assinatura." }, { status: 400 });
      await prismaPlataforma().assinatura.update({
        where: { escritorioId: escritorio.id },
        data: { valorCentavos: corpo.data.valorCentavos },
      });
      const reais = (corpo.data.valorCentavos / 100).toFixed(2).replace(".", ",");
      await registrarAcessoSuporte(
        operador.operadorId,
        escritorio.id,
        `Valor da mensalidade: ${corpo.data.valorCentavos ? `R$ ${reais}` : "tabela"}`,
      );
      return NextResponse.json({
        detalhe: corpo.data.valorCentavos
          ? `Mensalidade fechada em R$ ${reais}. Vale a partir da próxima fatura.`
          : "Mensalidade pela tabela. Vale a partir da próxima fatura.",
      });
    }

    if (corpo.data.acao === "encerrarTeste") {
      const assinatura = await prismaPlataforma().assinatura.findUnique({ where: { escritorioId: escritorio.id } });
      if (!assinatura) return NextResponse.json({ erro: "Escritório sem assinatura." }, { status: 400 });
      const agora = new Date();
      if (assinatura.fimDoTeste <= agora) {
        return NextResponse.json({ erro: "O período de teste já acabou." }, { status: 409 });
      }
      await prismaPlataforma().assinatura.update({
        where: { escritorioId: escritorio.id },
        data: { fimDoTeste: agora },
      });
      await registrarAcessoSuporte(operador.operadorId, escritorio.id, "Teste encerrado antes do prazo");
      return NextResponse.json({
        detalhe: "Teste encerrado. A primeira fatura sai na próxima regua — ou agora, em \"Passar a regua\".",
      });
    }

    if (corpo.data.acao === "nuvem") {
      // Copia agora para a nuvem do escritorio o que ficou para tras (falha,
      // nuvem conectada depois). Sem nuvem conectada, o trabalho so confere.
      await enfileirar("ORGANIZAR_NUVEM", escritorio.id);
      return NextResponse.json({ detalhe: "Cópia para a nuvem na fila." });
    }

    if (corpo.data.acao === "reativar") {
      const atual = await prismaPlataforma().escritorio.findUnique({
        where: { id: escritorio.id },
        select: { status: true, purgadoEm: true },
      });
      if (atual?.status !== "ENCERRADO" || atual.purgadoEm) {
        return NextResponse.json({ erro: "Só dá para reativar encerrado que ainda não foi apagado." }, { status: 400 });
      }
      await reativarEscritorio(escritorio.id);
      await prismaPlataforma().assinatura.updateMany({ where: { escritorioId: escritorio.id }, data: { canceladaEm: null } });
      await registrarAcessoSuporte(operador.operadorId, escritorio.id, "Reativado");
      return NextResponse.json({ detalhe: "Escritório reativado." });
    }

    if (corpo.data.acao === "excluir") {
      try {
        const r = await excluirEscritorio(escritorio.id, {
          confirmacao: corpo.data.confirmacao,
          motivo: corpo.data.motivo,
          operadorId: operador.operadorId,
        });
        return NextResponse.json({
          detalhe:
            r.modo === "APAGADO"
              ? `${r.slug} excluído por inteiro. O endereço está livre.`
              : `${r.slug}: dados apagados. Ficaram só faturas, assinatura, aceites e notas (registro fiscal).`,
        });
      } catch (erro) {
        if (erro instanceof ExclusaoRecusada) return NextResponse.json({ erro: erro.message }, { status: 400 });
        throw erro;
      }
    }

    if (corpo.data.acao === "cupom") {
      try {
        const cupom = await aplicarCupom(escritorio.id, corpo.data.codigo);
        await registrarAcessoSuporte(operador.operadorId, escritorio.id, `Cupom aplicado: ${cupom.codigo}`);
        return NextResponse.json({ detalhe: `Cupom ${cupom.codigo} aplicado: vale a partir da próxima fatura.` });
      } catch (erro) {
        if (erro instanceof CupomInvalido) return NextResponse.json({ erro: erro.message }, { status: 400 });
        throw erro;
      }
    }

    if (corpo.data.acao === "removerCupom") {
      await removerCupom(escritorio.id);
      await registrarAcessoSuporte(operador.operadorId, escritorio.id, "Cupom retirado");
      return NextResponse.json({ detalhe: "Cupom retirado: a próxima fatura sai sem o desconto." });
    }

    if (corpo.data.acao === "cortesia") {
      const assinatura = await prismaPlataforma().assinatura.findUnique({ where: { escritorioId: escritorio.id } });
      if (!assinatura) {
        return NextResponse.json({ erro: "Escritório sem assinatura." }, { status: 400 });
      }
      if (corpo.data.ligar && !corpo.data.motivo) {
        return NextResponse.json({ erro: "Diga o motivo da cortesia: fica registrado." }, { status: 400 });
      }
      // Fim da isencao: o fim do dia escolhido, em Brasilia (03h UTC do dia seguinte).
      const ate = corpo.data.ate ? new Date(`${corpo.data.ate}T03:00:00Z`) : null;
      if (ate) ate.setUTCDate(ate.getUTCDate() + 1);
      if (corpo.data.ligar && ate && ate <= new Date()) {
        return NextResponse.json({ erro: "A data final da isenção tem de ser futura." }, { status: 400 });
      }
      await prismaPlataforma().assinatura.update({
        where: { escritorioId: escritorio.id },
        data: corpo.data.ligar
          ? {
              cortesiaDesde: new Date(),
              cortesiaAte: ate,
              cortesiaMotivo: corpo.data.motivo,
              cortesiaPor: operador.nome ?? operador.operadorId,
            }
          : { cortesiaDesde: null, cortesiaAte: null, cortesiaMotivo: null, cortesiaPor: null },
      });
      await registrarAcessoSuporte(
        operador.operadorId,
        escritorio.id,
        corpo.data.ligar
          ? `Cortesia concedida${corpo.data.ate ? ` até ${corpo.data.ate.split("-").reverse().join("/")}` : ""}: ${corpo.data.motivo}`
          : "Cortesia retirada",
      );
      // Na hora, para o status ja refletir (cortesia deixa ATIVO).
      const r = await aplicarRegua(escritorio.id);
      return NextResponse.json({
        detalhe: corpo.data.ligar
          ? corpo.data.ate
            ? `Isenção até ${corpo.data.ate.split("-").reverse().join("/")}: nenhuma fatura até lá; depois a régua volta a cobrar sozinha. Status ${r.statusNovo}.`
            : `Cortesia ligada: nenhuma fatura será gerada. Status ${r.statusNovo}.`
          : `Cortesia retirada: a regua volta a cobrar no próximo vencimento. Status ${r.statusNovo}.`,
      });
    }

    const resultado = await aplicarRegua(escritorio.id);
    return NextResponse.json({
      detalhe:
        `Regua aplicada: ${resultado.statusAnterior} -> ${resultado.statusNovo}` +
        (resultado.faturaGerada ? ", fatura gerada." : "."),
    });
  } catch (erro) {
    return tratar(erro);
  }
}
