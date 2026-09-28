import { emReais } from "@/lib/dinheiro";
import { fatias } from "@/lib/financeiro";

/**
 * Pizza das despesas por categoria.
 *
 * SVG puro, sem biblioteca de grafico: sao poucas fatias, o desenho e
 * estatico, e uma dependencia de 200 KB para desenhar sete arcos sairia mais
 * cara que o grafico. Os angulos vem prontos de financeiro.ts, onde sao
 * testados — e onde a ultima fatia fecha o circulo por construcao, para nao
 * sobrar risco branco por arredondamento.
 */
const CORES = [
  "#1e3a5f",
  "#c9a227",
  "#4a6fa5",
  "#8c6d1f",
  "#7d94b5",
  "#b08d57",
  "#2f5233",
  "#94a3b8",
];

function ponto(grau: number, raio: number): [number, number] {
  // -90 para o grafico comecar no topo, que e onde o olho procura.
  const radianos = ((grau - 90) * Math.PI) / 180;
  return [50 + raio * Math.cos(radianos), 50 + raio * Math.sin(radianos)];
}

export function GraficoDePizza({
  porCategoria,
}: {
  porCategoria: { categoria: string; rotulo: string; centavos: number }[];
}) {
  const pedacos = fatias(porCategoria);
  if (pedacos.length === 0) {
    return (
      <p className="vazio">
        Sem despesa lancada neste mes. O grafico aparece com o primeiro
        lancamento.
      </p>
    );
  }

  const total = porCategoria.reduce((s, c) => s + c.centavos, 0);

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
      <svg viewBox="0 0 100 100" className="h-44 w-44 shrink-0" role="img"
        aria-label={`Despesas por categoria, total ${emReais(total)}`}>
        {pedacos.map((fatia, i) => {
          // Uma fatia unica nao pode virar arco: o caminho comeca e termina no
          // mesmo ponto e o navegador nao desenha nada. Circulo inteiro.
          if (pedacos.length === 1) {
            return (
              <circle key={fatia.categoria} cx="50" cy="50" r="42" fill={CORES[0]} />
            );
          }
          const [x1, y1] = ponto(fatia.de, 42);
          const [x2, y2] = ponto(fatia.ate, 42);
          const maior = fatia.ate - fatia.de > 180 ? 1 : 0;
          return (
            <path
              key={fatia.categoria}
              d={`M 50 50 L ${x1} ${y1} A 42 42 0 ${maior} 1 ${x2} ${y2} Z`}
              fill={CORES[i % CORES.length]}
            />
          );
        })}
        <circle cx="50" cy="50" r="22" className="fill-white" />
      </svg>

      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {pedacos.map((fatia, i) => (
          <li key={fatia.categoria} className="flex items-baseline gap-2">
            <span
              className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: CORES[i % CORES.length] }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate esquerda">{fatia.rotulo}</span>
            <span className="tabular-nums text-slate-500">
              {fatia.porcentagem.toFixed(0)}%
            </span>
            <span className="tabular-nums font-medium">
              {emReais(fatia.centavos)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
