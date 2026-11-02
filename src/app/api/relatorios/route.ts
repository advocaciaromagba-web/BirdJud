import { NextResponse } from "next/server";
import { exigirAdministracao, exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { TIPOS_DE_RELATORIO, montarPeriodo, montarRelatorio, type TipoDeRelatorio } from "@/lib/relatorios/dados";
import { gerarPdfDoRelatorio } from "@/lib/relatorios/pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Cada relatorio pede a permissao da area de onde os dados saem. Os tres
 * que mostram o dinheiro do escritorio (financeiro, caixa e previsoes) passam
 * pela segunda senha, como a tela do Financeiro: um PDF com o resultado do ano
 * nao pode ser mais facil de obter que a tela que mostra o mesmo numero.
 */
async function exigirAcesso(tipo: TipoDeRelatorio) {
  if (tipo === "clientes") return exigirSessao(undefined, "CLIENTES");
  if (tipo === "cobrancas") return exigirSessao("COBRANCAS", "COBRANCAS");
  return exigirAdministracao("FINANCEIRO");
}

export async function GET(req: Request) {
  try {
    const p = new URL(req.url).searchParams;
    const tipo = String(p.get("tipo") ?? "") as TipoDeRelatorio;
    if (!TIPOS_DE_RELATORIO.includes(tipo)) return NextResponse.json({ erro: "Relatório não reconhecido." }, { status: 400 });
    const { escritorioId } = await exigirAcesso(tipo);

    const de = String(p.get("de") ?? "");
    const ate = String(p.get("ate") ?? "");
    if (!DATA.test(de) || !DATA.test(ate)) return NextResponse.json({ erro: "Informe o período: data inicial e final." }, { status: 400 });
    if (de > ate) return NextResponse.json({ erro: "A data inicial é depois da final." }, { status: 400 });

    const relatorio = await montarRelatorio(escritorioId, tipo, montarPeriodo(de, ate), { todosOsClientes: p.get("todos") === "1" });
    const pdf = await gerarPdfDoRelatorio(relatorio);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="relatorio-${tipo}-${de}-a-${ate}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (erro) {
    return tratarErro(erro);
  }
}
