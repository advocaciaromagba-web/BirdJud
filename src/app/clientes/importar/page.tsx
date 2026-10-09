import Link from "next/link";
import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { Estrutura } from "@/componentes/Estrutura";
import { ImportadorDeClientes } from "@/componentes/ImportadorDeClientes";
import { importacoesDoEscritorio } from "@/lib/importacao-do-escritorio";

export const dynamic = "force-dynamic";

export default async function ImportarClientes() {
  const contexto = await contextoDaPagina(undefined, "CLIENTES");
  const modulos = await modulosAtivos(contexto.escritorioId);
  const estrutura = {
    nomeEscritorio: contexto.marca.nome,
    logoUrl: contexto.marca.logoUrl,
    papel: contexto.papel,
    nomeUsuario: contexto.nomeUsuario,
    acesso: contexto.acesso,
    modulos,
    titulo: "Importar clientes",
  };
  if (contexto.papel !== "ADMIN") {
    return (
      <Estrutura {...estrutura}>
        <p className="mt-4 leitura text-slate-600">
          Importar clientes em massa e com o administrador do escritorio.
        </p>
      </Estrutura>
    );
  }
  const importacoes = await importacoesDoEscritorio(contexto.escritorioId);
  return (
    <Estrutura {...estrutura} chamada="Trazer os clientes do sistema anterior por planilha do Excel ou CSV.">
      <Link href="/clientes" className="text-sm text-slate-500">
        ← clientes
      </Link>
      <ImportadorDeClientes
        rota="/api/clientes/importar"
        importacoes={importacoes.map((i) => ({
          ...i,
          criadaEm: i.criadaEm.toISOString(),
          desfeitaEm: i.desfeitaEm?.toISOString() ?? null,
        }))}
      />
    </Estrutura>
  );
}
