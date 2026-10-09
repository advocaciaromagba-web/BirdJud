// Como um escritorio nasce. Uma funcao so para o cadastro publico e para a
// implantacao feita pela plataforma: escritorio montado pela Blackbird tem de
// ser identico ao que se cadastrou sozinho — mesmos modulos, mesma franquia,
// mesma assinatura. Diferenca de nascimento vira defeito que so aparece meses
// depois, na fatura.
import { z } from "zod";
import { prismaPlataforma } from "./prisma";
import { criarAssinatura } from "./cobranca";
import { contaMontada } from "./planos";
import { definirModulos } from "./contratacao";
import type { Faixa } from "./faixas";
import type { Modulo } from "./catalogo";

export const RESERVADOS = new Set([
  "www", "app", "api", "admin", "painel", "plataforma", "suporte",
]);

export const slugValido = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "O endereco aceita letras minusculas, numeros e hifen.");

export class EnderecoIndisponivel extends Error {
  readonly status = 409;
  constructor(motivo: string) {
    super(motivo);
    this.name = "EnderecoIndisponivel";
  }
}

export type Nascimento = {
  slug: string;
  nome: string;
  modulos: Modulo[];
  faixa: Faixa;
  diasDeTeste: number;
  /** Preco fechado. Ausente: o da tabela para os modulos e a faixa. */
  valorCentavos?: number;
  implantadoPor?: string | null;
};

export async function nascerEscritorio(n: Nascimento) {
  const slug = n.slug.toLowerCase();
  if (RESERVADOS.has(slug)) throw new EnderecoIndisponivel("Este endereco e reservado.");
  const ja = await prismaPlataforma().escritorio.findUnique({ where: { slug }, select: { id: true } });
  if (ja) throw new EnderecoIndisponivel("Este endereco ja esta em uso.");

  const escolhidos = n.modulos.filter((m): m is Modulo => m !== "NUCLEO");
  const conta = contaMontada(escolhidos, n.faixa);
  // A conta pode ter subido para um plano pronto mais barato que a soma: os
  // contratados sao os desse plano, nao so os que foram marcados.
  const contratados = conta.modulos.map((linha) => linha.modulo);

  const escritorio = await prismaPlataforma().escritorio.create({
    data: {
      slug,
      nome: n.nome,
      status: "TESTE",
      faixa: n.faixa,
      implantadoPor: n.implantadoPor ?? null,
      implantadoEm: n.implantadoPor ? new Date() : null,
    },
  });
  // definirModulos grava tambem a franquia: sem ela nada viraria excedente.
  await definirModulos(escritorio.id, contratados, n.faixa);
  const valor = n.valorCentavos ?? conta.totalCentavos;
  await criarAssinatura(escritorio.id, valor, n.diasDeTeste);
  return { escritorio, plano: conta.plano, mensalidadeCentavos: valor };
}
