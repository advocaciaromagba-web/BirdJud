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
          area="A administração do escritório"
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
        enderecos: true,
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
      nomeUsuario={contexto.nomeUsuario}
      acesso={contexto.acesso}
      modulos={modulos}
      titulo="Administracao"
    >
      <p className="mt-1 leitura text-sm text-slate-500">
        Área destravada por {MINUTOS_DESTRAVADO} minutos. Depois disso a senha e
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
          sedeAtual={Array.isArray(escritorio?.enderecos) ? escritorio!.enderecos[0] : null}
        />

        <TrocaDaSenhaDeAdministracao
          definidaEm={escritorio?.senhaAdminEm?.toISOString() ?? null}
        />

        {temNfse ? (
          <EnvioDeCertificado
            jaEnviado={Boolean(certificado)}
            resumo={
              certificado?.status === "OK"
                ? (certificado.erro ?? "Certificado cadastrado e válido.")
                : (certificado?.erro ?? null)
            }
          />
        ) : (
          <section className="cartao">
            <p className="sobretitulo">Nota fiscal</p>
            <h2 className="mt-1 text-lg font-bold">Certificado digital A1</h2>
            <p className="mt-2 leitura text-slate-600">
              O módulo de NFS-e não faz parte do plano deste escritório. Sem
              ele não há emissão de nota, e o certificado não tem o que
              assinar.
            </p>
          </section>
        )}

        <section className="cartao">
          <p className="sobretitulo">Comunicação</p>
          <h2 className="mt-1 text-lg font-bold">Mensagens não entregues</h2>
          <p className="mt-2 leitura text-slate-600">
            WhatsApp e e-mail que não chegaram ao cliente: o motivo, o
            reenvio e o que já foi resolvido. Quem enviou recebe o alerta na
            hora, com o link desta tela.
          </p>
          <Link className="botao-secundario mt-4 inline-block" href="/mensagens">
            Abrir mensagens
          </Link>
        </section>

        <section className="cartao">
          <p className="sobretitulo">Comunicação</p>
          <h2 className="mt-1 text-lg font-bold">Envio automático aos clientes</h2>
          <p className="mt-2 leitura text-slate-600">
            Desligar o WhatsApp ou o e-mail de um cliente: o sistema para de mandar avisos, lembretes, cobranças,
            recibos, notas e documentos por aquele canal, sem apagar o contato do cadastro.
          </p>
          <Link className="botao-secundario mt-4 inline-block" href="/administracao/envios">
            Abrir envios
          </Link>
        </section>

        <section className="cartao">
          <p className="sobretitulo">Pessoas</p>
          <h2 className="mt-1 text-lg font-bold">Usuários do escritório</h2>
          <p className="mt-2 leitura text-slate-600">
            Incluir, desativar e definir o papel de cada pessoa. Quantas cabem
            depende da faixa contratada.
          </p>
          <Link className="botao-secundario mt-4 inline-block" href="/usuarios">
            Abrir usuários
          </Link>
        </section>
      </div>
    </Estrutura>
  );
}
