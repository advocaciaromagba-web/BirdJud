import Link from "next/link";
import { redirect } from "next/navigation";
import { prismaPlataforma } from "@/lib/prisma";
import { exigirOperador, SemOperador } from "@/lib/plataforma";
import { emReais } from "@/lib/dinheiro";
import { NavegacaoDaPlataforma } from "@/componentes/NavegacaoDaPlataforma";
import { ConfigFiscal } from "@/componentes/ConfigFiscal";
import { EmissaoAutomatica } from "@/componentes/EmissaoAutomatica";
import { AcoesDaNotaDaPlataforma } from "@/componentes/AcoesDaNotaDaPlataforma";
import { fiscalParaTela } from "@/lib/nfse/cadastro";
import { certificadoDaPlataforma, fiscalDaPlataforma, pendenciasDaPlataforma } from "@/lib/nota-da-plataforma";
import type { CertificadoCarregado } from "@/lib/nfse/certificado";

export const dynamic = "force-dynamic";

const data = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");

/** Nota fiscal da mensalidade: o emissor (Blackbird) e as notas emitidas. */
export default async function NotasDaPlataforma() {
  let operador;
  try {
    operador = await exigirOperador();
  } catch (erro) {
    if (erro instanceof SemOperador) redirect("/plataforma/login");
    throw erro;
  }

  const fiscal = await fiscalDaPlataforma();
  let cert: CertificadoCarregado | null = null;
  let erroDoCertificado: string | null = null;
  try {
    cert = certificadoDaPlataforma();
  } catch (e) {
    erroDoCertificado = (e as Error).message;
  }
  const pendencias = pendenciasDaPlataforma(fiscal, cert);
  if (erroDoCertificado) pendencias.unshift(`O certificado das variáveis não abriu: ${erroDoCertificado}`);

  const notas = await prismaPlataforma().notaDaPlataforma.findMany({ orderBy: { criadoEm: "desc" }, take: 100 });

  return (
    <main className="pagina">
      <NavegacaoDaPlataforma ativo="/plataforma/notas" operador={operador.nome} />
      <h1 className="mt-6">Notas fiscais da mensalidade</h1>
      <p className="chamada">
        A Blackbird emitindo para os escritórios, pelo Sistema Nacional da NFS-e. Sai sozinha quando a fatura é paga
        (com a emissão automática ligada) e vai ao e-mail do escritório. Também se emite e cancela por aqui ou pela
        ficha do escritório.
      </p>

      <section className="cartao-aperto mt-6 text-sm">
        <h2 className="font-semibold">Emissor</h2>
        <p className="mt-2">
          {fiscal ? `${fiscal.razaoSocial} · CNPJ ${fiscal.cnpj} · ${fiscal.ambiente === "PRODUCAO" ? "PRODUCAO" : "TESTES (produção restrita, sem valor fiscal)"}` : "Ainda não cadastrado."}
        </p>
        <p className="mt-1">
          Certificado:{" "}
          {cert
            ? `${cert.titular}, válido até ${data(cert.validoAte)}`
            : "não configurado (variáveis NFSE_PLATAFORMA_PFX e NFSE_PLATAFORMA_SENHA no Railway)"}
        </p>
        {pendencias.length ? (
          <ul className="aviso-atencao mt-3 list-disc pl-6">
            {pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          <p className="aviso-ok mt-3">Pronto para emitir.</p>
        )}
        <div className="mt-4">
          <EmissaoAutomatica ligada={Boolean(fiscal?.automatica)} podeLigar={pendencias.length === 0} />
        </div>
      </section>

      <section className="mt-6">
        <h2>Notas</h2>
        {notas.length === 0 ? (
          <p className="vazio mt-2">Nenhuma nota emitida ainda.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-200 text-sm">
            {notas.map((n) => (
              <li key={n.id} className="py-2">
                <span className="font-semibold">{n.tomadorNome}</span>{" "}
                <Link className="text-xs underline" href={`/plataforma/${n.escritorioId}`}>
                  ficha
                </Link>
                <span className="block text-xs text-slate-500">
                  {data(n.criadoEm)} · {emReais(n.valorCentavos)} · {n.origem === "AUTOMATICA" ? "automatica" : "manual"}
                  {n.motivoCancelamento ? ` · cancelada: ${n.motivoCancelamento}` : ""}
                </span>
                <AcoesDaNotaDaPlataforma
                  faturaId={n.faturaId ?? n.faturaOriginalId ?? ""}
                  nota={{
                    id: n.id,
                    status: n.status,
                    numero: n.numeroNaPrefeitura ?? (n.numero ? String(n.numero) : null),
                    erro: n.erro,
                    ambiente: n.ambiente,
                    enviadaEm: n.enviadaEm ? data(n.enviadaEm) : null,
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2>Cadastro fiscal da Blackbird</h2>
        <p className="ajuda">
          Código de tributação sugerido 010501 (licenciamento de programa de computador, LC 116 item 1.05) — confirme
          com o contador, assim como o regime e o percentual de tributos. Comece em Testes.
        </p>
        <ConfigFiscal
          fiscal={fiscal ? fiscalParaTela(fiscal) : null}
          temIA
          rota="/api/plataforma/emissor"
          rotaDaLeitura="/api/plataforma/leitura"
        />
      </section>
    </main>
  );
}
