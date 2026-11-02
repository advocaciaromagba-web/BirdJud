import Link from "next/link";

type Contrato = { id: string; clienteId: string; cliente: string; misto: boolean; percentual: string | null; descricao: string | null };

/** Os contratos de exito com o percentual ao lado do nome. Sem percentual, aviso. */
export function ContratosDeExito({ contratos }: { contratos: Contrato[] }) {
  if (!contratos.length) return null;
  const semPercentual = contratos.filter((c) => !c.percentual).length;
  return (
    <section className="cartao mt-5">
      <h2 className="text-lg font-bold">Contratos por êxito</h2>
      <p className="ajuda">
        Não entram na previsão: o valor só existe quando a ação termina. O percentual ao lado é o que permite estimar o que entra.
      </p>
      {semPercentual ? (
        <p className="mt-2 text-sm font-medium text-red-700">
          {semPercentual} contrato(s) de êxito sem o percentual preenchido: complete na ficha do cliente antes da hora de cobrar.
        </p>
      ) : null}
      <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
        {contratos.map((c) => (
          <li key={c.id} className="flex flex-wrap items-baseline gap-x-2">
            <Link href={`/clientes/${c.clienteId}`} className="font-medium text-marca hover:underline">
              {c.cliente}
            </Link>
            {c.percentual ? (
              <span className="tabular-nums">
                {c.percentual}
                {c.misto ? " + valor fixo" : ""}
              </span>
            ) : (
              <span className="font-medium text-red-700">sem percentual</span>
            )}
            {c.descricao ? <span className="text-slate-500">{c.descricao}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
