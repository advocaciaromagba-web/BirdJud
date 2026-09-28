import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio, semEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { TIPOS_DE_COMPROMISSO, faltaParaGravar } from "@/lib/compromissos";
import { formatarDocumento } from "@/lib/documentos";
import { tratarErro } from "@/lib/respostas";

const novoCompromisso = z.object({
  titulo: z.string().min(2).max(200),
  tipo: z.enum(TIPOS_DE_COMPROMISSO).default("COMPROMISSO"),
  inicio: z.string().datetime({ offset: true }).or(z.string().min(10)),
  local: z.string().max(200).optional(),
  processoId: z.string().optional(),
  clienteId: z.string().optional(),
  // Cliente novo cadastrado na propria tela: a reuniao costuma ser o primeiro
  // contato, e obrigar a sair para cadastrar antes e o jeito certo de a
  // pessoa nao cadastrar.
  clienteNovo: z
    .object({
      nome: z.string().min(2).max(120),
      documento: z.string().max(20).optional(),
      email: z.string().email().max(200).optional().or(z.literal("")),
      telefone: z.string().max(30).optional(),
    })
    .optional(),
  observacoes: z.string().max(2000).optional(),
});

export async function GET() {
  try {
    const { escritorioId } = await exigirSessao();
    const compromissos = await comEscritorio(escritorioId, (db) =>
      db.compromisso.findMany({
        where: { inicio: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        orderBy: { inicio: "asc" },
        take: 200,
        include: { cliente: { select: { id: true, nome: true } } },
      }),
    );
    return NextResponse.json({ compromissos });
  } catch (erro) {
    return tratarErro(erro);
  }
}

export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirSessao();
    const corpo = novoCompromisso.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }

    const inicio = new Date(corpo.data.inicio);
    if (Number.isNaN(inicio.getTime())) {
      return NextResponse.json({ erro: "Data invalida." }, { status: 400 });
    }

    // Tarefa exige cliente; agendamento nao. A regra vive em um so lugar.
    const falta = faltaParaGravar(corpo.data);
    if (falta) return NextResponse.json({ erro: falta }, { status: 400 });

    const { clienteNovo, ...campos } = corpo.data;

    const resultado = await comEscritorio(escritorioId, async (db) => {
      if (campos.processoId) {
        const processo = await db.processo.findFirst({
          where: { id: campos.processoId },
        });
        if (!processo) return { erro: "Processo nao encontrado." };
      }
      if (campos.clienteId) {
        const cliente = await db.cliente.findFirst({
          where: { id: campos.clienteId },
        });
        if (!cliente) return { erro: "Cliente nao encontrado." };
      }

      let clienteId = campos.clienteId;
      if (clienteNovo) {
        const criado = await db.cliente.create({
          data: semEscritorio({
            nome: clienteNovo.nome,
            documento: clienteNovo.documento
              ? formatarDocumento(clienteNovo.documento)
              : null,
            email: clienteNovo.email || null,
            telefone: clienteNovo.telefone || null,
          }),
        });
        clienteId = criado.id;
      }

      const compromisso = await db.compromisso.create({
        data: semEscritorio({ ...campos, clienteId, inicio }),
        include: { cliente: { select: { id: true, nome: true } } },
      });
      return { compromisso };
    });

    if ("erro" in resultado) {
      return NextResponse.json({ erro: resultado.erro }, { status: 400 });
    }
    return NextResponse.json(resultado, { status: 201 });
  } catch (erro) {
    return tratarErro(erro);
  }
}
