import { redirect } from "next/navigation";
import { comEscritorio } from "@/lib/prisma";
import { exigirAdmin, SemSessao } from "@/lib/sessao";
import { SemPermissao } from "@/lib/papeis";
import { moduloAtivo, modulosAtivos } from "@/lib/modulos";
import { CONECTORES } from "@/lib/conectores";
import { Navegacao } from "@/componentes/Navegacao";
import { PainelIntegracoes, type IntegracaoNaTela } from "@/componentes/PainelIntegracoes";

export default async function PaginaIntegracoes() {
  let contexto;
  try {
    contexto = await exigirAdmin();
  } catch (erro) {
    if (erro instanceof SemSessao) redirect("/login");
    if (erro instanceof SemPermissao) {
      return (
        <main className="mx-auto max-w-2xl p-10">
          <h1 className="text-2xl font-bold">Area restrita</h1>
          <p className="mt-3 text-neutral-600">
            So administradores do escritorio conectam integracoes.
          </p>
        </main>
      );
    }
    throw erro;
  }

  const modulos = await modulosAtivos(contexto.escritorioId);
  const guardadas = await comEscritorio(contexto.escritorioId, (db) =>
    db.integracao.findMany({
      // Note o que NAO esta aqui: o campo `dados`. A credencial nunca sai do
      // servidor, nem para o administrador que a cadastrou.
      select: { tipo: true, status: true, erro: true, verificadoEm: true },
    })
  );
  const porTipo = new Map(guardadas.map((i) => [i.tipo, i]));

  const integracoes: IntegracaoNaTela[] = [];
  for (const conector of Object.values(CONECTORES)) {
    if (conector.modulo && !(await moduloAtivo(contexto.escritorioId, conector.modulo))) continue;
    const guardada = porTipo.get(conector.tipo);
    integracoes.push({
      tipo: conector.tipo,
      rotulo: conector.rotulo,
      descricao: conector.descricao,
      campos: conector.campos,
      conectada: Boolean(guardada),
      status: guardada?.status ?? null,
      erro: guardada?.erro ?? null,
      verificadoEm: guardada?.verificadoEm?.toISOString() ?? null,
    });
  }

  return (
    <>
      <Navegacao nomeEscritorio={contexto.marca.nome} papel={contexto.papel} modulos={modulos} />
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold">Integracoes</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Cada escritorio conecta as proprias contas. As credenciais ficam
          cifradas e nunca aparecem de volta na tela.
        </p>
        <PainelIntegracoes integracoes={integracoes} />
      </main>
    </>
  );
}
