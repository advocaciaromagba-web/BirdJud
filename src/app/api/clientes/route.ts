import { NextResponse } from "next/server";
import { cutucarNuvem } from "@/lib/avisar-nuvem";
import { z } from "zod";
import { comEscritorio, semEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { paraCentavos } from "@/lib/dinheiro";
import {
  conferirClienteRepetido,
  mensagemDoConflito,
} from "@/lib/duplicados-do-escritorio";
import { salvarContrato } from "@/lib/honorarios-do-escritorio";
import type { Forma } from "@/lib/cobrancas";

const novoCliente = z.object({
  nome: z.string().min(2).max(200),
  documento: z.string().max(20).optional(),
  email: z.string().email().optional(),
  telefone: z.string().max(20).optional(),

  // Endereco, em partes. O CEP chega com ou sem hifen.
  cep: z.string().max(12).optional(),
  logradouro: z.string().max(200).optional(),
  numero: z.string().max(20).optional(),
  complemento: z.string().max(120).optional(),
  bairro: z.string().max(120).optional(),
  cidade: z.string().max(120).optional(),
  uf: z.string().max(2).optional(),

  // Honorarios, no mesmo gesto do cadastro. Tudo opcional: cliente entra
  // antes de haver contrato, e obrigar o valor aqui faria alguem inventar um
  // numero so para conseguir cadastrar.
  honValor: z.string().max(20).optional(),
  honEntrada: z.string().max(20).optional(),
  honParcelas: z.union([z.string(), z.number()]).optional(),
  honPercentual: z.string().max(10).optional(),
  honPrimeiroVencimento: z.string().max(10).optional(),
  honForma: z.string().max(20).optional(),
  honDescricao: z.string().max(120).optional(),

  // Quem cadastra viu o aviso de nome repetido e disse que e outra pessoa.
  // So vale para nome: documento igual e a mesma pessoa, e isso nao se
  // confirma, se corrige.
  confirmarHomonimo: z.boolean().optional(),
});

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** "12,5" -> 1250 centesimos. Nenhum percentual de dinheiro em float. */
function paraCentesimos(texto: string): number | null {
  const limpo = texto.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(limpo)) return null;
  const n = Math.round(Number(limpo) * 100);
  return n > 0 && n <= 10_000 ? n : null;
}

export async function GET() {
  try {
    const { escritorioId } = await exigirSessao();
    const clientes = await comEscritorio(escritorioId, (db) =>
      db.cliente.findMany({ orderBy: { nome: "asc" }, take: 200 }),
    );
    return NextResponse.json({ clientes });
  } catch (erro) {
    return tratarErro(erro);
  }
}

/**
 * O endereco do cadastro, no formato da ficha. A rua vai com os dois nomes
 * que o codigo usa (logradouro e rua). Nada preenchido: sem endereco.
 */
function enderecoDoCadastro(d: {
  cep?: string; logradouro?: string; numero?: string; complemento?: string;
  bairro?: string; cidade?: string; uf?: string;
}): Record<string, string> | null {
  const e: Record<string, string> = {};
  const cep = (d.cep ?? "").replace(/\D/g, "");
  if (cep.length === 8) e.cep = cep;
  const rua = d.logradouro?.trim();
  if (rua) {
    e.logradouro = rua;
    e.rua = rua;
  }
  for (const k of ["numero", "complemento", "bairro", "cidade"] as const) {
    const v = d[k]?.trim();
    if (v) e[k] = v;
  }
  const uf = d.uf?.trim().toUpperCase();
  if (uf && /^[A-Z]{2}$/.test(uf)) e.uf = uf;
  return Object.keys(e).length ? e : null;
}

export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirSessao();
    const corpo = novoCliente.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }
    const d = corpo.data;

    const conflito = await conferirClienteRepetido(escritorioId, {
      nome: d.nome,
      documento: d.documento,
    });
    if (conflito && !(conflito.motivo === "NOME" && d.confirmarHomonimo)) {
      return NextResponse.json(
        {
          erro: mensagemDoConflito(conflito),
          // A tela precisa saber se da para confirmar: documento igual, nao.
          podeConfirmar: conflito.motivo === "NOME",
          existenteId: conflito.existente.id,
        },
        { status: 409 },
      );
    }

    const valorCentavos = d.honValor?.trim() ? paraCentavos(d.honValor) : null;
    const entradaCentavos = d.honEntrada?.trim() ? paraCentavos(d.honEntrada) : null;
    const percentualBp = d.honPercentual?.trim() ? paraCentesimos(d.honPercentual) : null;
    const querContrato = !!(valorCentavos || percentualBp);

    if (d.honValor?.trim() && valorCentavos === null) {
      return NextResponse.json({ erro: "Valor dos honorarios invalido." }, { status: 400 });
    }
    if (d.honEntrada?.trim() && entradaCentavos === null) {
      return NextResponse.json({ erro: "Valor da entrada invalido." }, { status: 400 });
    }
    if (d.honPercentual?.trim() && percentualBp === null) {
      return NextResponse.json({ erro: "Percentual de exito invalido." }, { status: 400 });
    }
    if (querContrato && valorCentavos && !DIA.test(d.honPrimeiroVencimento ?? "")) {
      return NextResponse.json(
        { erro: "Com valor de honorarios, informe a data do primeiro vencimento." },
        { status: 400 },
      );
    }

    // escritorioId nunca vem do corpo: a extensao injeta o da sessao.
    const cliente = await comEscritorio(escritorioId, (db) =>
      db.cliente.create({
        data: semEscritorio({
          nome: d.nome,
          documento: d.documento,
          email: d.email,
          telefone: d.telefone,
          endereco: enderecoDoCadastro(d) ?? undefined,
        }),
      }),
    );

    // O contrato nasce junto, quando ha o que contratar. Se ele falhar, o
    // cliente ja esta cadastrado — e e o certo: perder o cadastro inteiro por
    // causa de um campo de honorario seria pior que ficar sem o contrato, que
    // da para lancar depois na ficha.
    if (querContrato) {
      const parcelas = Math.max(1, Math.round(Number(d.honParcelas ?? 1) || 1));
      await salvarContrato(escritorioId, {
        clienteId: cliente.id,
        tipo: valorCentavos && percentualBp ? "MISTO" : percentualBp ? "PERCENTUAL" : "VALOR",
        valorCentavos,
        entradaCentavos,
        percentualBp,
        parcelas,
        primeiroVencimento: DIA.test(d.honPrimeiroVencimento ?? "")
          ? d.honPrimeiroVencimento!
          : null,
        forma: (d.honForma as Forma) || "BOLETO",
        emissaoAutomatica: false,
        descricao: d.honDescricao ?? null,
      });
    }

    // A pasta do cliente na nuvem do escritorio sai pela fila, sem esperar.
    await cutucarNuvem(escritorioId);

    return NextResponse.json({ cliente }, { status: 201 });
  } catch (erro) {
    return tratarErro(erro);
  }
}
