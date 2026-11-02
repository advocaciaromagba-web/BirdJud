import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { Estrutura } from "@/componentes/Estrutura";
import { PainelRelatorios } from "@/componentes/PainelRelatorios";
import { NOME_DO_RELATORIO } from "@/lib/relatorios/dados";

export const dynamic = "force-dynamic";

const EXPLICACAO = {
  clientes: "Quem entrou no período, com documento, telefone, cidade, processos e o que foi cobrado e recebido de cada um.",
  cobrancas: "Emitido, recebido, vencido e a inadimplência em dinheiro; o atraso de cada cobrança, por faixa, e quem pagou com atraso.",
  financeiro: "Receita, despesa, resultado e margem do que foi pago no período, mês a mês e por categoria de despesa.",
  caixa: "Cada entrada e saída em ordem de data, com o saldo acumulado do período.",
  previsoes: "O que está lançado para entrar e sair no período: cobranças em aberto e contas a pagar.",
} as const;

/**
 * Relatorios em PDF. So aparece o que a pessoa pode tirar: cada relatorio
 * pede a area de onde os dados saem, e os de dinheiro do escritorio pedem o
 * administrador com a segunda senha (a rota confere de novo).
 */
export default async function PaginaRelatorios() {
  const contexto = await contextoDaPagina();
  const modulos = await modulosAtivos(contexto.escritorioId);
  const ehAdmin = contexto.papel === "ADMIN";
  const relatorios = [
    contexto.acesso.CLIENTES === true ? { tipo: "clientes", protegido: false } : null,
    modulos.includes("COBRANCAS") && contexto.acesso.COBRANCAS === true ? { tipo: "cobrancas", protegido: false } : null,
    ...(modulos.includes("FINANCEIRO") && ehAdmin
      ? (["financeiro", "caixa", "previsoes"] as const).map((tipo) => ({ tipo, protegido: true }))
      : []),
  ]
    .filter((r): r is { tipo: keyof typeof EXPLICACAO; protegido: boolean } => r !== null)
    .map((r) => ({ ...r, nome: NOME_DO_RELATORIO[r.tipo], explicacao: EXPLICACAO[r.tipo] }));

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      nomeUsuario={contexto.nomeUsuario}
      acesso={contexto.acesso}
      modulos={modulos}
      titulo="Relatórios"
      chamada="Relatórios em PDF por período, com gráficos, para imprimir, arquivar ou mandar ao sócio e ao contador."
    >
      {relatorios.length ? (
        <PainelRelatorios relatorios={relatorios} />
      ) : (
        <p className="text-slate-600">Nenhum relatório está liberado para o seu acesso neste escritório.</p>
      )}
    </Estrutura>
  );
}
