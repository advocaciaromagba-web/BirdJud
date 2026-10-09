// Graficos do painel da plataforma, em SVG puro.
//
// Cores validadas (daltonismo e contraste) — ver docs/PAINEL-DA-PLATAFORMA.md:
//   categorica, em ordem fixa: azul, laranja, verde-agua, amarelo, magenta;
//   ordinal (mais = mais escuro): cinco passos de um azul so.
// Tres cores categoricas ficam abaixo de 3:1 sobre o branco; por isso toda
// pizza tem a legenda com o numero escrito ao lado, e nenhum valor depende so
// da cor. O vao branco de 2px entre fatias separa vizinhas para quem ve
// cores parecidas.
import { emReais } from "@/lib/dinheiro";
import type { Fatia } from "@/lib/painel-plataforma";

export const CATEGORICA = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
export const ORDINAL = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"];

type Formato = "moeda" | "contagem";
const formatar = (v: number, f: Formato) => (f === "moeda" ? emReais(v) : String(v));

function ponto(grau: number, raio: number): [number, number] {
  const r = ((grau - 90) * Math.PI) / 180;
  return [50 + raio * Math.cos(r), 50 + raio * Math.sin(r)];
}

function arco(inicio: number, fim: number, raio = 46): string {
  const [x1, y1] = ponto(inicio, raio);
  const [x2, y2] = ponto(fim, raio);
  const grande = fim - inicio > 180 ? 1 : 0;
  return `M50,50 L${x1.toFixed(3)},${y1.toFixed(3)} A${raio},${raio} 0 ${grande} 1 ${x2.toFixed(3)},${y2.toFixed(3)} Z`;
}

/**
 * Pizza de parte do todo, com legenda que e tambem a tabela: rotulo, valor e
 * percentual escritos. Fatia zerada fica na legenda (com 0) e fora do
 * desenho, para a mesma cor significar sempre a mesma coisa.
 */
export function Pizza({
  titulo,
  fatias,
  cores,
  formato,
  vazio,
}: {
  titulo: string;
  fatias: Fatia[];
  cores: string[];
  formato: Formato;
  vazio: string;
}) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  let angulo = 0;
  const desenhos = fatias.map((f, i) => {
    const graus = total ? (f.valor / total) * 360 : 0;
    const d = { ...f, cor: cores[i % cores.length], inicio: angulo, fim: angulo + graus };
    angulo += graus;
    return d;
  });
  const visiveis = desenhos.filter((d) => d.valor > 0);

  return (
    <figure className="cartao m-0">
      <figcaption className="font-semibold text-slate-900">{titulo}</figcaption>
      {total === 0 ? (
        <p className="mt-6 text-sm text-slate-500">{vazio}</p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <svg viewBox="0 0 100 100" className="h-40 w-40 shrink-0" role="img" aria-label={titulo}>
            {visiveis.length === 1 ? (
              <circle cx="50" cy="50" r="46" fill={visiveis[0].cor}>
                <title>{`${visiveis[0].rotulo}: ${formatar(visiveis[0].valor, formato)} (100%)`}</title>
              </circle>
            ) : (
              visiveis.map((d) => (
                <path
                  key={d.chave}
                  d={arco(d.inicio, d.fim)}
                  fill={d.cor}
                  stroke="#ffffff"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                  className="transition-opacity hover:opacity-80"
                >
                  <title>{`${d.rotulo}: ${formatar(d.valor, formato)} (${Math.round((d.valor / total) * 100)}%)`}</title>
                </path>
              ))
            )}
          </svg>
          <table className="text-sm">
            <tbody>
              {desenhos.map((d) => (
                <tr key={d.chave}>
                  <td className="py-0.5 pr-2">
                    <span aria-hidden className="inline-block h-3 w-3 rounded-sm align-middle" style={{ background: d.cor }} />
                  </td>
                  <td className="py-0.5 pr-4 text-slate-700">{d.rotulo}</td>
                  <td className="py-0.5 pr-3 text-right font-medium tabular-nums text-slate-900">{formatar(d.valor, formato)}</td>
                  <td className="py-0.5 text-right tabular-nums text-slate-500">
                    {total ? `${Math.round((d.valor / total) * 100)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}

/**
 * Colunas por mes, empilhando ate duas series. Um eixo so (em reais), linhas
 * de grade discretas, total escrito em cima de cada coluna e a tabela logo
 * abaixo.
 */
export function Colunas({
  titulo,
  explicacao,
  meses,
  series,
}: {
  titulo: string;
  explicacao: string;
  meses: { rotulo: string; valores: number[] }[];
  series: { rotulo: string; cor: string }[];
}) {
  const L = 640;
  const A = 220;
  const margemEsq = 8;
  const topo = 22;
  const base = A - 26;
  const maior = Math.max(1, ...meses.map((m) => m.valores.reduce((s, v) => s + v, 0)));
  const escala = (v: number) => (v / maior) * (base - topo);
  const passo = (L - margemEsq * 2) / meses.length;
  const largura = Math.min(56, passo * 0.56);
  const grades = [0.5, 1].map((p) => base - (base - topo) * p);

  return (
    <figure className="cartao m-0">
      <figcaption>
        <span className="font-semibold text-slate-900">{titulo}</span>
        <span className="mt-1 block text-sm text-slate-500">{explicacao}</span>
      </figcaption>
      {series.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-700">
          {series.map((s) => (
            <span key={s.rotulo} className="inline-flex items-center gap-2">
              <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: s.cor }} />
              {s.rotulo}
            </span>
          ))}
        </div>
      ) : null}
      <svg viewBox={`0 0 ${L} ${A}`} className="mt-3 w-full" role="img" aria-label={titulo}>
        {grades.map((y) => (
          <line key={y} x1={0} x2={L} y1={y} y2={y} stroke="#e1e0d9" strokeWidth="1" />
        ))}
        <line x1={0} x2={L} y1={base} y2={base} stroke="#c3c2b7" strokeWidth="1" />
        {meses.map((m, i) => {
          const x = margemEsq + passo * i + (passo - largura) / 2;
          let y = base;
          const total = m.valores.reduce((s, v) => s + v, 0);
          const ultimo = m.valores.reduce((u, v, j) => (v > 0 ? j : u), -1);
          return (
            <g key={m.rotulo}>
              {m.valores.map((v, j) => {
                if (v <= 0) return null;
                const h = Math.max(1, escala(v));
                y -= h;
                const topoDaColuna = j === ultimo;
                // Cantos de 4px so na ponta de cima; o vao de 2px separa os pedacos.
                const r = topoDaColuna ? Math.min(4, h / 2) : 0;
                const altura = j === 0 ? h : h - 2;
                const d = r
                  ? `M${x},${y + altura} V${y + r} Q${x},${y} ${x + r},${y} H${x + largura - r} Q${x + largura},${y} ${x + largura},${y + r} V${y + altura} Z`
                  : `M${x},${y + altura} V${y} H${x + largura} V${y + altura} Z`;
                return (
                  <path key={j} d={d} fill={series[j].cor} className="transition-opacity hover:opacity-80">
                    <title>{`${m.rotulo} · ${series[j].rotulo}: ${emReais(v)}`}</title>
                  </path>
                );
              })}
              {total > 0 ? (
                <text x={x + largura / 2} y={y - 6} textAnchor="middle" fontSize="11" fill="#52514e">
                  {emReais(total).replace(/,00$/, "")}
                </text>
              ) : null}
              <text x={x + largura / 2} y={A - 8} textAnchor="middle" fontSize="12" fill="#898781">
                {m.rotulo}
              </text>
            </g>
          );
        })}
      </svg>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-slate-500">Ver em tabela</summary>
        <table className="tabela mt-2">
          <thead>
            <tr>
              <th>Mes</th>
              {series.map((s) => (
                <th key={s.rotulo} className="text-right">{s.rotulo}</th>
              ))}
              {series.length > 1 ? <th className="text-right">Total</th> : null}
            </tr>
          </thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.rotulo}>
                <td>{m.rotulo}</td>
                {m.valores.map((v, j) => (
                  <td key={j} className="text-right tabular-nums">{emReais(v)}</td>
                ))}
                {series.length > 1 ? (
                  <td className="text-right font-medium tabular-nums">{emReais(m.valores.reduce((s, v) => s + v, 0))}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Cartao de numero: o numero e o grafico. */
export function Numero({ rotulo, valor, detalhe, alerta }: { rotulo: string; valor: string; detalhe?: string; alerta?: boolean }) {
  return (
    <div className="cartao text-left">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className="mt-2 whitespace-nowrap text-2xl font-bold tabular-nums text-slate-900">{valor}</p>
      {detalhe ? (
        <p className={`mt-1 text-left text-sm ${alerta ? "font-medium text-red-700" : "text-slate-500"}`}>
          {alerta ? "⚠ " : ""}
          {detalhe}
        </p>
      ) : null}
    </div>
  );
}
