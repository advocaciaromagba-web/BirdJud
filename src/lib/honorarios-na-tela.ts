// Contratos de honorarios do jeito que a ficha do cliente mostra.
//
// Mora aqui, e nao na pagina, porque a tela de Honorarios saiu do menu: o
// contrato agora e cadastrado e acompanhado na ficha do cliente, junto da
// procuracao, da declaracao e do contrato em documento.
import { comEscritorio } from "./prisma";
import { diaBR } from "./datas";
import { emReais } from "./dinheiro";
import { percentualEmTexto } from "./honorarios";
import { situacaoDoContrato } from "./honorarios-do-escritorio";
import type { ContratoNaTela } from "@/componentes/PainelHonorarios";

const NOME_DA_FORMA: Record<string, string> = {
  BOLETO: "Boleto",
  PIX: "Pix",
  CARTAO: "Cartao",
  QUALQUER: "O cliente escolhe",
};

/** Uma linha curta dizendo o que o contrato combina. */
function resumoDoContrato(c: {
  tipo: string;
  valorCentavos: number | null;
  percentualBp: number | null;
  parcelas: number;
}): string {
  const fixo = c.valorCentavos ? emReais(c.valorCentavos) : null;
  const exito = c.percentualBp ? percentualEmTexto(c.percentualBp) : null;
  const vezes = c.parcelas > 1 ? ` em ${c.parcelas}x` : " a vista";

  if (c.tipo === "PERCENTUAL") return `${exito ?? "?"} de exito`;
  if (c.tipo === "MISTO") return `${fixo ?? "?"}${vezes} de entrada + ${exito ?? "?"} de exito`;
  return `${fixo ?? "?"}${vezes}`;
}

export async function contratosDoCliente(
  escritorioId: string,
  clienteId: string,
): Promise<ContratoNaTela[]> {
  const contratos = await comEscritorio(escritorioId, (db) =>
    db.contratoDeHonorarios.findMany({
      where: { clienteId },
      orderBy: [{ ativo: "desc" }, { criadoEm: "desc" }],
      include: { cliente: true },
      take: 50,
    }),
  );
  if (contratos.length === 0) return [];

  // O que o financeiro ja recebeu de cada parcela (baixa por cobranca ou
  // pela conferencia do extrato).
  const recebidas = new Set(
    (
      await comEscritorio(escritorioId, (db) =>
        db.lancamento.findMany({
          where: { contratoId: { in: contratos.map((c) => c.id) }, pagoEm: { not: null } },
          select: { contratoId: true, parcelaNumero: true },
        }),
      )
    ).map((l) => `${l.contratoId}:${l.parcelaNumero}`),
  );

  const naTela: ContratoNaTela[] = [];
  for (const c of contratos) {
    const s = await situacaoDoContrato(escritorioId, c);
    const emitidas = new Set(s.jaGeradas);
    naTela.push({
      id: c.id,
      clienteNome: c.cliente.nome,
      tipo: c.tipo,
      resumo: resumoDoContrato(c),
      forma: NOME_DA_FORMA[c.forma] ?? c.forma,
      automatico: c.emissaoAutomatica,
      ativo: c.ativo,
      parcelas: s.plano.parcelas.map((p) => ({
        numero: p.numero,
        total: p.total,
        valor: emReais(p.valorCentavos),
        vencimentoBR: diaBR(new Date(`${p.vencimento}T00:00:00Z`)),
        emitida: emitidas.has(p.numero),
        recebida: recebidas.has(`${c.id}:${p.numero}`),
      })),
      motivo: s.plano.emiteSozinho ? null : s.plano.motivo,
      proximaNumero: s.proxima?.numero ?? null,
      naJanela: s.naJanela,
      atrasada: s.atrasada,
      impedimentos: s.impedimentos,
    });
  }
  return naTela;
}
