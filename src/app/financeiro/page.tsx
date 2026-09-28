import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina, contextoProtegido } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { ModuloNaoContratado } from "@/lib/modulos";
import { Estrutura } from "@/componentes/Estrutura";
import { FormularioCriar } from "@/componentes/FormularioCriar";
import { emReais } from "@/lib/dinheiro";
import { PortaDeAdministracao } from "@/componentes/PortaDeAdministracao";
import { MINUTOS_DESTRAVADO } from "@/lib/administracao";

const TIPOS = [
  { valor: "RECEITA", rotulo: "Receita" },
  { valor: "DESPESA", rotulo: "Despesa" },
];

export default async function PaginaFinanceiro() {
  // O financeiro e do administrador, e pede a segunda senha. As duas coisas:
  // o dinheiro do escritorio nao e assunto de quem tem so uma sessao aberta.
  let porta;
  try {
    porta = await contextoProtegido("FINANCEIRO");
  } catch (erro) {
    if (erro instanceof ModuloNaoContratado) {
      return (
        <main className="mx-auto max-w-2xl p-10">
          <h1 className="text-2xl font-bold">Modulo nao contratado</h1>
          <p className="mt-3 text-slate-600">
            O modulo Financeiro nao faz parte do plano deste escritorio.
          </p>
        </main>
      );
    }
    throw erro;
  }

  if (porta.tranca) {
    const base = await contextoDaPagina();
    const ativos = await modulosAtivos(base.escritorioId);
    return (
      <Estrutura
        nomeEscritorio={base.marca.nome}
        logoUrl={base.marca.logoUrl}
        papel={base.papel}
        modulos={ativos}
        titulo="Financeiro"
      >
        <PortaDeAdministracao
          tranca={porta.tranca}
          area="O financeiro"
          minutos={MINUTOS_DESTRAVADO}
        />
      </Estrutura>
    );
  }

  const contexto = porta.contexto;

  const [modulos, lancamentos] = await Promise.all([
    modulosAtivos(contexto.escritorioId),
    comEscritorio(contexto.escritorioId, (db) =>
      db.lancamento.findMany({ orderBy: { criadoEm: "desc" }, take: 200 }),
    ),
  ]);

  const saldo = lancamentos.reduce(
    (total, l) =>
      total + (l.tipo === "RECEITA" ? l.valorCentavos : -l.valorCentavos),
    0,
  );

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      modulos={modulos}
      titulo="Financeiro"
    >
      <p className="mt-1 text-sm text-slate-500">
        Saldo dos lancamentos listados: {emReais(saldo)}
      </p>

      <FormularioCriar
        rota="/api/lancamentos"
        campos={[
          { nome: "descricao", rotulo: "Descricao", obrigatorio: true },
          { nome: "valor", rotulo: "Valor (R$)", obrigatorio: true },
          {
            nome: "tipo",
            rotulo: "Tipo",
            tipo: "select",
            opcoes: TIPOS,
            obrigatorio: true,
          },
        ]}
        textoBotao="Lancar"
      />

      {lancamentos.length === 0 ? (
        <p className="mt-6 text-slate-600">Nenhum lancamento.</p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-200">
          {lancamentos.map((lancamento) => (
            <li key={lancamento.id} className="flex justify-between gap-4 py-3">
              <span>
                <span className="font-semibold">{lancamento.descricao}</span>
                <span className="block text-sm text-slate-500">
                  {lancamento.competencia}
                </span>
              </span>
              <span
                className={`tabular-nums font-semibold ${
                  lancamento.tipo === "RECEITA"
                    ? "text-green-700"
                    : "text-red-700"
                }`}
              >
                {lancamento.tipo === "RECEITA" ? "+" : "−"}
                {emReais(lancamento.valorCentavos)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Estrutura>
  );
}
