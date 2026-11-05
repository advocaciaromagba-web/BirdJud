"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIAS_DE_DESPESA, rotuloDaCategoria } from "@/lib/financeiro";
import { paraCentavos } from "@/lib/dinheiro";
import { ARQUIVOS_POR_VEZ, contasDaLeitura, emGrupos, type ContaLida } from "@/lib/contas-em-lote";
import type { Leitura } from "@/lib/leitura-documento";

type Linha = ContaLida & { marcada: boolean; paga: boolean; erro?: string };

/**
 * Varias contas de uma vez: agua, energia, telefone, pericia e os boletos do
 * mes. Cada conta volta numa linha editavel, com o arquivo de onde saiu;
 * marca-se o que entra e lanca-se de uma vez. Nada e gravado antes do clique.
 */
export function LeituraDeContasEmLote() {
  const router = useRouter();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [falhas, setFalhas] = useState<{ arquivo: string; motivo: string }[]>([]);
  const [andamento, setAndamento] = useState<{ lidos: number; total: number } | null>(null);
  const [lancando, setLancando] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);

  async function ler(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const arquivos = Array.from(new FormData(form).getAll("arquivos")).filter((a): a is File => a instanceof File && a.size > 0);
    if (!arquivos.length) {
      setRecado("Escolha os arquivos das contas primeiro.");
      return;
    }
    setRecado(null);
    setFalhas([]);
    setAndamento({ lidos: 0, total: arquivos.length });
    const lote = Date.now().toString(36);
    await emGrupos(arquivos, ARQUIVOS_POR_VEZ, async (arquivo, i) => {
      const dados = new FormData();
      dados.set("perfil", "CONTA");
      dados.append("arquivos", arquivo);
      try {
        const r = await fetch("/api/ia/leitura", { method: "POST", body: dados });
        // Conexao derrubada no caminho devolve HTML, nao JSON.
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.leitura) throw new Error(j?.erro ?? "A conexão caiu no meio da leitura. Mande este arquivo de novo.");
        const contas = contasDaLeitura(j.leitura as Leitura, arquivo.name, `${lote}-${i}`);
        if (!contas.length) throw new Error("Nenhuma conta com valor foi encontrada neste arquivo.");
        setLinhas((atuais) => [...atuais, ...contas.map((c) => ({ ...c, marcada: true, paga: false }))]);
      } catch (erro) {
        setFalhas((atuais) => [...atuais, { arquivo: arquivo.name, motivo: (erro as Error).message }]);
      } finally {
        setAndamento((a) => (a ? { ...a, lidos: a.lidos + 1 } : a));
      }
    });
    form.reset();
  }

  const mudar = (chave: string, campo: Partial<Linha>) =>
    setLinhas((atuais) => atuais.map((l) => (l.chave === chave ? { ...l, ...campo, erro: undefined } : l)));

  const marcadas = linhas.filter((l) => l.marcada);
  const invalidas = marcadas.filter((l) => !l.descricao.trim() || !paraCentavos(l.valor));

  async function lancar() {
    setLancando(true);
    setRecado(null);
    let certas = 0;
    for (const l of marcadas) {
      const r = await fetch("/api/lancamentos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          descricao: l.descricao.trim(),
          valor: l.valor,
          tipo: "DESPESA",
          categoria: l.categoria,
          fornecedor: l.fornecedor.trim() || undefined,
          vencimento: l.vencimento || undefined,
          pago: l.paga ? "sim" : "nao",
          observacoes: `Lido de ${l.arquivo}.`,
        }),
      });
      if (r.ok) {
        certas += 1;
        setLinhas((atuais) => atuais.filter((x) => x.chave !== l.chave));
      } else {
        const j = await r.json().catch(() => ({}));
        mudar(l.chave, {});
        setLinhas((atuais) => atuais.map((x) => (x.chave === l.chave ? { ...x, erro: j.erro ?? "Não entrou." } : x)));
      }
    }
    setLancando(false);
    setRecado(`${certas} conta(s) lançada(s).`);
    router.refresh();
  }

  const lendo = andamento !== null && andamento.lidos < andamento.total;

  return (
    <section className="cartao">
      <h2 className="text-lg font-bold">Ler várias contas de uma vez</h2>
      <p className="ajuda">
        Junte água, energia, telefone, perícia e os boletos do mês. Cada arquivo é lido separado, e cada conta volta numa linha para conferir antes de
        lançar.
      </p>
      <form onSubmit={ler} className="mt-3 flex flex-wrap items-center gap-3">
        <input name="arquivos" type="file" multiple accept="application/pdf,image/*" className="min-w-0 max-w-full text-sm" disabled={lendo} />
        <button type="submit" className="botao-principal" disabled={lendo || lancando}>
          {lendo ? `Lendo ${andamento!.lidos} de ${andamento!.total}…` : "Ler as contas"}
        </button>
      </form>

      {falhas.length ? (
        <ul className="mt-3 grid gap-1 text-sm text-red-700">
          {falhas.map((f) => (
            <li key={f.arquivo}>
              <strong>{f.arquivo}</strong>: {f.motivo}
            </li>
          ))}
        </ul>
      ) : null}

      {linhas.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th className="w-8">
                  <span className="sr-only">Lançar</span>
                </th>
                <th>Descrição</th>
                <th>Quem emitiu</th>
                <th>Valor (R$)</th>
                <th>Vencimento</th>
                <th>Categoria</th>
                <th>Já paga</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.chave} className={l.conferir ? "bg-amber-50" : undefined}>
                  <td>
                    <input type="checkbox" aria-label={`Lançar ${l.descricao}`} checked={l.marcada} onChange={(e) => mudar(l.chave, { marcada: e.target.checked })} />
                  </td>
                  <td className="min-w-48">
                    <input className="campo" value={l.descricao} onChange={(e) => mudar(l.chave, { descricao: e.target.value })} aria-label="Descrição" />
                    <p className="mt-1 text-xs text-slate-500">
                      {l.arquivo}
                      {l.conferir ? " · confira: leitura com dúvida" : ""}
                    </p>
                    {l.observacoes.map((o) => (
                      <p key={o} className="text-xs text-amber-800">
                        {o}
                      </p>
                    ))}
                    {l.erro ? <p className="text-xs text-red-700">{l.erro}</p> : null}
                  </td>
                  <td className="min-w-36">
                    <input className="campo" value={l.fornecedor} onChange={(e) => mudar(l.chave, { fornecedor: e.target.value })} aria-label="Quem emitiu" />
                  </td>
                  <td className="min-w-28">
                    <input
                      className="campo tabular-nums"
                      inputMode="decimal"
                      value={l.valor}
                      onChange={(e) => mudar(l.chave, { valor: e.target.value })}
                      aria-label="Valor"
                      aria-invalid={!paraCentavos(l.valor)}
                    />
                  </td>
                  <td>
                    <input className="campo" type="date" value={l.vencimento} onChange={(e) => mudar(l.chave, { vencimento: e.target.value })} aria-label="Vencimento" />
                  </td>
                  <td>
                    <select className="campo" value={l.categoria} onChange={(e) => mudar(l.chave, { categoria: e.target.value })} aria-label="Categoria">
                      {CATEGORIAS_DE_DESPESA.map((c) => (
                        <option key={c} value={c}>
                          {rotuloDaCategoria(c)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="text-center">
                    <input type="checkbox" aria-label="Já paga" checked={l.paga} onChange={(e) => mudar(l.chave, { paga: e.target.checked })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className="botao-principal" disabled={lancando || lendo || !marcadas.length || invalidas.length > 0} onClick={lancar}>
              {lancando ? "Lançando…" : `Lançar ${marcadas.length} marcada(s)`}
            </button>
            <button type="button" className="botao-discreto" disabled={lancando} onClick={() => setLinhas([])}>
              Descartar a leitura
            </button>
            {invalidas.length ? <span className="text-sm text-red-700">{invalidas.length} marcada(s) sem descrição ou com valor inválido.</span> : null}
          </div>
        </div>
      ) : null}
      {recado ? (
        <p role="status" className="mt-2 text-sm text-slate-700">
          {recado}
        </p>
      ) : null}
    </section>
  );
}
