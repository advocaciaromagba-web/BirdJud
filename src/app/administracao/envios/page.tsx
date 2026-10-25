import Link from "next/link";
import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina, contextoProtegido } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { Estrutura } from "@/componentes/Estrutura";
import { PortaDeAdministracao } from "@/componentes/PortaDeAdministracao";
import { EnvioDoCliente } from "@/componentes/EnvioDoCliente";
import { MINUTOS_DESTRAVADO } from "@/lib/administracao";

export const dynamic = "force-dynamic";

/**
 * Quem recebe mensagem automatica do escritorio, e por qual canal.
 *
 * Por padrao, so os clientes com algum canal desligado: e a lista que o
 * escritorio precisa revisar de vez em quando, e a que ninguem acha
 * procurando cliente por cliente. A busca acha qualquer um para desligar.
 */
export default async function EnviosDosClientes({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const porta = await contextoProtegido();
  if (porta.tranca) {
    const base = await contextoDaPagina();
    return (
      <Estrutura nomeEscritorio={base.marca.nome} logoUrl={base.marca.logoUrl} papel={base.papel} modulos={await modulosAtivos(base.escritorioId)} titulo="Envio automático aos clientes">
        <PortaDeAdministracao tranca={porta.tranca} area="A administração do escritório" minutos={MINUTOS_DESTRAVADO} />
      </Estrutura>
    );
  }
  const contexto = porta.contexto;
  const busca = ((await searchParams).q ?? "").trim().slice(0, 80);
  const desligado = { OR: [{ notificarWhatsapp: false }, { notificarEmail: false }] };

  const [clientes, silenciados] = await Promise.all([
    comEscritorio(contexto.escritorioId, (db) =>
      db.cliente.findMany({
        where: busca
          ? {
              OR: [
                { nome: { contains: busca, mode: "insensitive" } },
                { documento: { contains: busca.replace(/\D/g, "") || busca } },
                { email: { contains: busca, mode: "insensitive" } },
                { telefone: { contains: busca } },
              ],
            }
          : desligado,
        orderBy: { nome: "asc" },
        take: 100,
        select: {
          id: true,
          nome: true,
          telefone: true,
          email: true,
          notificarWhatsapp: true,
          notificarEmail: true,
          envioAlteradoEm: true,
          envioAlteradoPor: true,
        },
      }),
    ),
    comEscritorio(contexto.escritorioId, (db) => db.cliente.count({ where: desligado })),
  ]);

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      nomeUsuario={contexto.nomeUsuario}
      acesso={contexto.acesso}
      modulos={await modulosAtivos(contexto.escritorioId)}
      titulo="Envio automático aos clientes"
    >
      <p className="leitura text-sm text-slate-600">
        Desligado, o sistema não manda nada ao cliente por aquele canal: avisos de compromisso, lembretes, cobranças
        (inclusive os avisos do Asaas), recibos, notas fiscais e documentos. Quem clicar em enviar vê o motivo. O
        telefone e o e-mail continuam no cadastro, para ligar e escrever à mão.
      </p>

      <form className="mt-4 flex flex-wrap gap-2" action="/administracao/envios">
        <input name="q" defaultValue={busca} placeholder="Buscar cliente por nome, CPF/CNPJ, telefone ou e-mail" className="campo min-w-0 flex-1" />
        <button className="botao-secundario" type="submit">Buscar</button>
        {busca ? (
          <Link href="/administracao/envios" className="botao-discreto">
            Ver só os desligados ({silenciados})
          </Link>
        ) : null}
      </form>

      <p className="mt-4 text-sm text-slate-500">
        {busca
          ? `${clientes.length} cliente(s) encontrados.`
          : silenciados
            ? `${silenciados} cliente(s) com algum canal desligado.`
            : "Nenhum cliente com envio desligado. Busque acima para desligar o de alguém."}
      </p>

      <ul className="mt-3 grid gap-3">
        {clientes.map((c) => (
          <li key={c.id} className="cartao-aperto">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/clientes/${c.id}`} className="font-semibold text-marca">
                {c.nome}
              </Link>
              <span className="text-xs text-slate-500">{[c.telefone, c.email].filter(Boolean).join(" · ") || "sem contato"}</span>
            </div>
            <div className="mt-2">
              <EnvioDoCliente
                compacto
                clienteId={c.id}
                notificarWhatsapp={c.notificarWhatsapp}
                notificarEmail={c.notificarEmail}
                alteradoEm={c.envioAlteradoEm?.toISOString() ?? null}
                alteradoPor={c.envioAlteradoPor}
                podeMexer
              />
            </div>
          </li>
        ))}
      </ul>
    </Estrutura>
  );
}
