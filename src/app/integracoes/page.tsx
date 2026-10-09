import { redirect } from "next/navigation";
import { comEscritorio } from "@/lib/prisma";
import { exigirAdmin, SemSessao } from "@/lib/sessao";
import { SemPermissao } from "@/lib/papeis";
import { moduloAtivo, modulosAtivos } from "@/lib/modulos";
import { CONECTORES } from "@/lib/conectores";
import { NUVENS } from "@/lib/nuvem";
import { resumoDaNuvem } from "@/lib/nuvem-do-escritorio";
import { Estrutura } from "@/componentes/Estrutura";
import {
  PainelIntegracoes,
  type IntegracaoNaTela,
} from "@/componentes/PainelIntegracoes";

export default async function PaginaIntegracoes({
  searchParams,
}: {
  searchParams: Promise<{ nuvem?: string; motivo?: string }>;
}) {
  const retorno = await searchParams;
  let contexto;
  try {
    contexto = await exigirAdmin();
  } catch (erro) {
    if (erro instanceof SemSessao) redirect("/login");
    if (erro instanceof SemPermissao) {
      return (
        <main className="mx-auto max-w-2xl p-10">
          <h1 className="text-2xl font-bold">Area restrita</h1>
          <p className="mt-3 text-slate-600">
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
    }),
  );
  const porTipo = new Map(guardadas.map((i) => [i.tipo, i]));
  const nuvem = await resumoDaNuvem(contexto.escritorioId).catch(() => null);

  const integracoes: IntegracaoNaTela[] = [];
  for (const conector of Object.values(CONECTORES)) {
    if (
      conector.modulo &&
      !(await moduloAtivo(contexto.escritorioId, conector.modulo))
    )
      continue;
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
      ...(conector.oauth
        ? {
            oauth: conector.oauth === "MICROSOFT" ? ("microsoft" as const) : ("google" as const),
            disponivel: NUVENS[conector.oauth].configurada(),
            bloqueadaPor:
              nuvem && nuvem.provedor !== conector.oauth ? nuvem.rotulo : null,
            nuvem:
              nuvem && nuvem.provedor === conector.oauth
                ? {
                    conta: nuvem.conta,
                    endereco: nuvem.endereco,
                    pastas: nuvem.pastas,
                    copiados: nuvem.copiados,
                  }
                : null,
          }
        : {}),
    });
  }

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      nomeUsuario={contexto.nomeUsuario}
      acesso={contexto.acesso}
      modulos={modulos}
      titulo="Integracoes"
    >
      <p className="mt-1 text-sm text-slate-500">
        Cada escritorio conecta as proprias contas. As credenciais ficam
        cifradas e nunca aparecem de volta na tela.
      </p>
      {retorno.nuvem === "conectada" ? (
        <p className="aviso-ok mt-4">
          Nuvem conectada. A pasta BirdJud / Clientes ja foi criada, e as pastas
          dos clientes estao sendo criadas agora.
        </p>
      ) : retorno.nuvem === "erro" ? (
        <p className="aviso-erro mt-4">
          {retorno.motivo?.slice(0, 200) || "Nao foi possivel conectar a nuvem."}
        </p>
      ) : null}
      <PainelIntegracoes integracoes={integracoes} />
    </Estrutura>
  );
}
