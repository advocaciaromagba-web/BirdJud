import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { comEscritorio } from "@/lib/prisma";
import { diaBR } from "@/lib/datas";
import { emReais } from "@/lib/dinheiro";
import { percentualEmTexto } from "@/lib/honorarios";
import { situacaoDoContrato } from "@/lib/honorarios-do-escritorio";
import { Estrutura } from "@/componentes/Estrutura";
import {
  PainelHonorarios,
  type ContratoNaTela,
} from "@/componentes/PainelHonorarios";

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

export default async function PaginaHonorarios() {
  const contexto = await contextoDaPagina("COBRANCAS", "COBRANCAS");
  const modulos = await modulosAtivos(contexto.escritorioId);

  const [contratos, clientes, integracao] = await Promise.all([
    comEscritorio(contexto.escritorioId, (db) =>
      db.contratoDeHonorarios.findMany({
        orderBy: [{ ativo: "desc" }, { criadoEm: "desc" }],
        include: { cliente: true },
        take: 200,
      }),
    ),
    comEscritorio(contexto.escritorioId, (db) =>
      db.cliente.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true }, take: 500 }),
    ),
    comEscritorio(contexto.escritorioId, (db) =>
      db.integracao.findFirst({ where: { tipo: "ASAAS" }, select: { id: true } }),
    ),
  ]);

  const naTela: ContratoNaTela[] = [];
  for (const c of contratos) {
    const s = await situacaoDoContrato(contexto.escritorioId, c);
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
      })),
      motivo: s.plano.emiteSozinho ? null : s.plano.motivo,
      proximaNumero: s.proxima?.numero ?? null,
      naJanela: s.naJanela,
      atrasada: s.atrasada,
      impedimentos: s.impedimentos,
    });
  }

  // Contrato travado por cadastro incompleto nao conta como "a emitir": o
  // numero no alto tem de ser o que da para resolver clicando.
  const comParcelaDevida = naTela.filter(
    (c) => c.ativo && c.naJanela && !c.atrasada && c.proximaNumero !== null && c.impedimentos.length === 0,
  ).length;

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      nomeUsuario={contexto.nomeUsuario}
      acesso={contexto.acesso}
      modulos={modulos}
      titulo="Honorarios"
      chamada={
        comParcelaDevida === 0
          ? `${naTela.length} contrato(s).`
          : `${comParcelaDevida} contrato(s) com parcela a emitir.`
      }
    >
      <PainelHonorarios
        contratos={naTela}
        clientes={clientes}
        temConta={integracao !== null}
      />
    </Estrutura>
  );
}
