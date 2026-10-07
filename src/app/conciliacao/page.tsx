import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { comEscritorio } from "@/lib/prisma";
import { diaBR } from "@/lib/datas";
import { emReais } from "@/lib/dinheiro";
import { pendentesComSugestao } from "@/lib/extrato";
import { Estrutura } from "@/componentes/Estrutura";
import {
  PainelConciliacao,
  type EntradaNaTela,
} from "@/componentes/PainelConciliacao";

export default async function PaginaConciliacao() {
  const contexto = await contextoDaPagina("COBRANCAS", "CONCILIACAO");
  const modulos = await modulosAtivos(contexto.escritorioId);

  const [{ entradas, abertas }, integracao] = await Promise.all([
    pendentesComSugestao(contexto.escritorioId),
    comEscritorio(contexto.escritorioId, (db) =>
      db.integracao.findMany({
        where: { tipo: { in: ["ASAAS", "INFINITEPAY"] } },
        select: { tipo: true },
      }),
    ),
  ]);

  const porId = new Map(abertas.map((c) => [c.id, c]));

  const naTela: EntradaNaTela[] = entradas.map((e) => {
    let sugestao: string | null = null;
    let ambigua = false;
    if (e.sugestao.tipo === "CERTA" || e.sugestao.tipo === "PROVAVEL") {
      const c = porId.get(e.sugestao.cobrancaId);
      sugestao = c
        ? `${e.sugestao.tipo === "CERTA" ? "E" : "Parece ser"} a cobranca de ${c.nomeDoCliente} — ${c.descricao}`
        : null;
    } else if (e.sugestao.tipo === "AMBIGUA") {
      ambigua = true;
      // Nao escolhemos por quem olha: dizemos quais, e quem decide decide.
      sugestao = `${e.sugestao.motivo}: ${e.sugestao.candidatos
        .map((id) => porId.get(id)?.nomeDoCliente ?? id)
        .join(", ")}`;
    }

    return {
      id: e.id,
      rotulo: e.rotulo,
      tipo: e.tipo,
      valor: emReais(Math.abs(e.valorCentavos)),
      dataBR: diaBR(e.data),
      descricao: e.descricao,
      destino: e.destino,
      automatico: e.automatico,
      sugestao,
      ambigua,
    };
  });

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      acesso={contexto.acesso}
      modulos={modulos}
      titulo="Conferir o extrato"
      chamada={
        naTela.length === 0
          ? "Nada pendente."
          : `${naTela.length} lancamento(s) a conferir.`
      }
    >
      <PainelConciliacao
        entradas={naTela}
        temConta={integracao.some((i) => i.tipo === "ASAAS")}
        temInfinitePay={integracao.some((i) => i.tipo === "INFINITEPAY")}
      />
    </Estrutura>
  );
}
