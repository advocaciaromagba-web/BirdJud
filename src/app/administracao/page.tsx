import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina, contextoProtegido } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { Estrutura } from "@/componentes/Estrutura";
import { PortaDeAdministracao } from "@/componentes/PortaDeAdministracao";
import { EnvioDeCertificado } from "@/componentes/EnvioDeCertificado";
import { TrocaDaSenhaDeAdministracao } from "@/componentes/TrocaDaSenhaDeAdministracao";
import { IdentidadeDoEscritorio } from "@/componentes/IdentidadeDoEscritorio";
import { MINUTOS_DESTRAVADO } from "@/lib/administracao";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Aba do administrador do escritorio.
 *
 * Aqui ficam as acoes que mexem no escritorio inteiro e nao tem volta facil:
 * a senha de administracao, o certificado que assina as notas, e o caminho
 * para usuarios. Tudo atras da segunda senha — cada escritorio so enxerga o
 * proprio, como em qualquer outra tela.
 */
export default async function PaginaAdministracao() {
  const porta = await contextoProtegido();

  if (porta.tranca) {
    const base = await contextoDaPagina();
    const ativos = await modulosAtivos(base.escritorioId);
    return (
      <Estrutura
        nomeEscritorio={base.marca.nome}
        logoUrl={base.marca.logoUrl}
        papel={base.papel}
        modulos={ativos}
        titulo="Administracao"
      >
        <PortaDeAdministracao
          tranca={porta.tranca}
          area="A administracao do escritorio"
          minutos={MINUTOS_DESTRAVADO}
        />
      </Estrutura>
    );
  }

  const contexto = porta.contexto;
  const modulos = await modulosAtivos(contexto.escritorioId);

  const [certificado, escritorio] = await Promise.all([
    comEscritorio(contexto.escritorioId, (db) =>
      db.integracao.findFirst({
        where: { tipo: "NFSE_CERT" },
        select: { status: true, erro: true, verificadoEm: true },
      }),
    ),
    comEscritorio(contexto.escritorioId, (db) =>
      db.escritorio.findFirst({
        where: { id: contexto.escritorioId },
        select: {
        senhaAdminEm: true,
        corPrimaria: true,
        corSecundaria: true,
        telefoneAtendimento: true,
        cidade: true,
        cnpj: true,
        logoUrl: true,
      },
      }),
    ),
  ]);

  const temNfse = modulos.includes("NFSE");

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      modulos={modulos}
      titulo="Administracao"
    >
      <p className="mt-1 leitura text-sm text-slate-500">
        Area destravada por {MINUTOS_DESTRAVADO} minutos. Depois disso a senha e
        pedida de novo.
      </p>

      <div className="mt-6 space-y-6">
        <IdentidadeDoEscritorio
          nome={contexto.marca.nome}
          corPrimariaAtual={escritorio?.corPrimaria ?? "#0B1F3B"}
          corSecundariaAtual={escritorio?.corSecundaria ?? "#D4AF7C"}
          telefoneAtual={escritorio?.telefoneAtendimento ?? null}
          cidadeAtual={escritorio?.cidade ?? null}
          cnpjAtual={escritorio?.cnpj ?? null}
          logoUrlAtual={escritorio?.logoUrl ?? null}
        />

        <TrocaDaSenhaDeAdministracao
          definidaEm={escritorio?.senhaAdminEm?.toISOString() ?? null}
        />

        {temNfse ? (
          <EnvioDeCertificado
            jaEnviado={Boolean(certificado)}
            resumo={
              certificado?.status === "OK"
                ? (certificado.erro ?? "Certificado cadastrado e valido.")
                : (certificado?.erro ?? null)
            }
          />
        ) : (
          <section className="cartao">
            <p className="sobretitulo">Nota fiscal</p>
            <h2 className="mt-1 text-lg font-bold">Certificado digital A1</h2>
            <p className="mt-2 leitura text-slate-600">
              O modulo de NFS-e nao faz parte do plano deste escritorio. Sem
              ele nao ha emissao de nota, e o certificado nao tem o que
              assinar.
            </p>
          </section>
        )}

        <section className="cartao">
          <p className="sobretitulo">Pessoas</p>
          <h2 className="mt-1 text-lg font-bold">Usuarios do escritorio</h2>
          <p className="mt-2 leitura text-slate-600">
            Incluir, desativar e definir o papel de cada pessoa. Quantas cabem
            depende da faixa contratada.
          </p>
          <Link className="botao-secundario mt-4 inline-block" href="/usuarios">
            Abrir usuarios
          </Link>
        </section>
      </div>
    </Estrutura>
  );
}
