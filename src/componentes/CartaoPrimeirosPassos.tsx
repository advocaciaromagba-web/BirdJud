import Link from "next/link";
import type { Roteiro } from "@/lib/primeiros-passos";
import { BarraDeProgresso } from "./RoteiroDePrimeirosPassos";
import { MostrarNoInicio } from "./MostrarNoInicio";

/**
 * O roteiro na tela inicial, para o administrador.
 *
 * Mostra UM passo: o proximo. A lista inteira, na primeira tela, assusta — e
 * quem se assusta fecha. O roteiro completo fica a um clique.
 *
 * Escritorio que acabou de chegar ve o cartao grande, no lugar dos numeros
 * (que estariam todos em zero). Depois do essencial, ele encolhe.
 */
export function CartaoPrimeirosPassos({
  roteiro,
  nomeEscritorio,
}: {
  roteiro: Roteiro;
  nomeEscritorio: string;
}) {
  const p = roteiro.proximo;
  if (!p) return null;
  const chegando = roteiro.feitos === 0;

  return (
    <section
      className={`cartao border-l-4 border-l-[color:var(--marca-secundaria)] ${chegando ? "" : "mb-6"}`}
    >
      <p className="sobretitulo">Primeiros passos</p>
      <h2 className={`mt-1 font-bold ${chegando ? "text-2xl" : "text-lg"}`}>
        {chegando
          ? `Bem-vindo ao BirdJud, ${nomeEscritorio}.`
          : roteiro.essenciaisFeitos
            ? "Falta pouco para o sistema trabalhar sozinho."
            : "Continue a configuracao do escritorio."}
      </h2>
      {chegando ? (
        <p className="mt-2 leitura text-slate-600">
          Antes do primeiro cliente, o sistema precisa saber quem e o
          escritorio e quem trabalha nele. Sao tres passos essenciais, em menos
          de dez minutos; depois, as conexoes que fazem os avisos, as
          publicacoes e as cobrancas acontecerem sem ninguem lembrar.
        </p>
      ) : null}

      <div className="mt-4">
        <BarraDeProgresso
          porcento={roteiro.porcento}
          rotulo={`${roteiro.feitos} de ${roteiro.total} passos`}
        />
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Proximo passo · ~{p.minutos} min
        </p>
        <p className="mt-1 font-semibold text-slate-900">{p.titulo}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{p.porque}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={p.destino} className="botao-principal">
            {p.textoDoBotao}
          </Link>
          <Link href="/primeiros-passos" className="botao-secundario">
            Ver o roteiro completo
          </Link>
        </div>
      </div>
      <MostrarNoInicio dispensado={false} />
    </section>
  );
}
