import Link from "next/link";
import { redirect } from "next/navigation";
import { escritorioDoEndereco, exigirSessao } from "@/lib/sessao";
import { modulosAtivos } from "@/lib/modulos";
import { MARCA_NEUTRA } from "@/lib/escritorio";

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

  let contexto;
  try {
    contexto = await exigirSessao();
  } catch {
    redirect("/login");
  }

  const modulos = await modulosAtivos(contexto.escritorioId);

  return (
    <main className="mx-auto max-w-3xl p-10">
      <p className="text-sm uppercase tracking-wide text-marca">{marca.nome}</p>
      <h1 className="mt-2 text-3xl font-bold">Painel</h1>
      <p className="mt-2 text-neutral-600">
        {contexto.papel === "ADMIN" ? "Administrador" : "Usuario"} · {modulos.length} modulo(s)
        contratado(s)
      </p>
      <ul className="mt-6 grid gap-2">
        <li>
          <Link href="/clientes" className="font-semibold text-marca underline">
            Clientes
          </Link>
        </li>
      </ul>
    </main>
  );
}
