import Link from "next/link";
import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { escritorioDoEndereco } from "@/lib/sessao";
import { modulosAtivos } from "@/lib/modulos";
import { MARCA_NEUTRA } from "@/lib/escritorio";
import { Navegacao } from "@/componentes/Navegacao";

export default async function Painel() {
  const marca = await escritorioDoEndereco();

  if (!marca?.id) {
    return (
      <main className="mx-auto max-w-2xl p-10">
        <p className="text-sm uppercase tracking-wide text-marca">{MARCA_NEUTRA.nome}</p>
        <h1 className="mt-2 text-3xl font-bold">Sistema juridico white label</h1>
        <p className="mt-4 text-neutral-600">
          Cada escritorio atende em seu proprio endereco.
        </p>
      </main>
    );
  }

  const contexto = await contextoDaPagina();

  const [modulos, numeros] = await Promise.all([
    modulosAtivos(contexto.escritorioId),
    comEscritorio(contexto.escritorioId, async (db) => ({
      clientes: await db.cliente.count(),
      processos: await db.processo.count(),
      proximos: await db.compromisso.count({ where: { inicio: { gte: new Date() } } }),
    })),
  ]);

  const cartoes = [
    { href: "/clientes", rotulo: "Clientes", valor: numeros.clientes },
    { href: "/processos", rotulo: "Processos", valor: numeros.processos },
    { href: "/agenda", rotulo: "Proximos compromissos", valor: numeros.proximos },
  ];

  return (
    <>
      <Navegacao nomeEscritorio={marca.nome} papel={contexto.papel} />
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold">Painel</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {modulos.length} modulo(s) contratado(s)
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {cartoes.map((cartao) => (
            <Link
              key={cartao.href}
              href={cartao.href}
              className="rounded border border-neutral-200 p-4 hover:border-marca"
            >
              <p className="text-3xl font-bold tabular-nums">{cartao.valor}</p>
              <p className="text-sm text-neutral-600">{cartao.rotulo}</p>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
