"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export type NotaNaTela = {
  id: string;
  status: string;
  ambiente: string;
  numeroDps: number | null;
  numeroNfse: string | null;
  dataCompetencia: string;
  criadaEm: string;
  valorCentavos: number;
  descricao: string;
  tomadorNome: string;
  erros: { codigo: string; descricao: string }[];
  motivoCancelamento: string | null;
  vaiAoCliente: boolean;
  temXml: boolean;
};

type Cliente = { id: string; nome: string; documento: string | null };

const STATUS: Record<string, { texto: string; classe: string }> = {
  AGUARDANDO_ASSINATURA: { texto: "Aguardando assinatura", classe: "bg-amber-100 text-amber-900" },
  EMITIDA: { texto: "Emitida", classe: "bg-emerald-100 text-emerald-800" },
  REJEITADA: { texto: "Recusada", classe: "bg-red-100 text-red-800" },
  PROCESSANDO: { texto: "Confirmação pendente", classe: "bg-amber-100 text-amber-900" },
  CANCELADA: { texto: "Cancelada", classe: "bg-slate-100 text-slate-600" },
};

const moeda = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const erroEmTexto = (e: { codigo: string; descricao: string }[]) =>
  e.map((x) => `${x.codigo ? `${x.codigo} ` : ""}${x.descricao}`).join(" | ");

/**
 * Notas fiscais em dois tempos, como no sistema da Advocacia Roma: alguem da
 * equipe PREPARA; o titular do certificado ASSINA (varias de uma vez), com a
 * senha do e-CNPJ digitada na hora — ela nao fica guardada.
 */
export function PainelNotas({
  notas,
  clientes,
  pronto,
  producao,
  souTitular,
  titularNome,
  descricaoPadrao,
  inicial,
}: {
  notas: NotaNaTela[];
  clientes: Cliente[];
  pronto: boolean;
  producao: boolean;
  souTitular: boolean;
  titularNome: string | null;
  descricaoPadrao: string;
  inicial: { clienteId: string; valor: string; descricao: string; cobrancaId: string };
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    clienteId: inicial.clienteId,
    valor: inicial.valor,
    dataCompetencia: hoje(),
    descricao: inicial.descricao || descricaoPadrao,
    informacoesComplementares: "",
    email: false,
    whatsapp: false,
  });
  const [preparando, setPreparando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string; avisos: string[] } | null>(null);

  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [senha, setSenha] = useState("");
  const [assinando, setAssinando] = useState(false);
  const [resultadoAssinatura, setResultadoAssinatura] = useState<{ texto: string; ok: boolean }[] | null>(null);

  const [verificandoId, setVerificandoId] = useState<string | null>(null);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [cancelamento, setCancelamento] = useState({ motivo: "1", descricao: "" });
  const [acaoNota, setAcaoNota] = useState<string | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);

  const paraAssinar = notas.filter((n) => n.status === "AGUARDANDO_ASSINATURA" || n.status === "REJEITADA");
  const transmitidas = notas.filter((n) => n.status !== "AGUARDANDO_ASSINATURA" && n.status !== "REJEITADA");

  async function preparar(ev: FormEvent) {
    ev.preventDefault();
    if (!form.clienteId) return setResultado({ ok: false, texto: "Escolha o cliente (tomador do serviço).", avisos: [] });
    setPreparando(true);
    setResultado(null);
    const envioCliente = [form.email ? "EMAIL" : null, form.whatsapp ? "WHATSAPP" : null].filter(Boolean);
    const res = await fetch("/api/nfse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clienteId: form.clienteId,
        valor: form.valor,
        dataCompetencia: form.dataCompetencia,
        descricao: form.descricao,
        informacoesComplementares: form.informacoesComplementares || null,
        cobrancaId: inicial.cobrancaId || null,
        envioCliente,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setPreparando(false);
    if (!res.ok) return setResultado({ ok: false, texto: json.erro ?? "Não foi possível preparar a nota.", avisos: [] });
    setResultado({
      ok: true,
      texto: `Nota preparada — agora aguarda a assinatura de ${titularNome ?? "titular do certificado"}.`,
      avisos: json.avisos ?? [],
    });
    setForm((f) => ({ ...f, clienteId: "", valor: "", informacoesComplementares: "", email: false, whatsapp: false }));
    router.refresh();
  }

  async function assinar() {
    const escolhidas = paraAssinar.filter((n) => selecionadas.includes(n.id));
    if (escolhidas.length === 0) return setResultadoAssinatura([{ texto: "Marque as notas que vai assinar.", ok: false }]);
    if (!senha) return setResultadoAssinatura([{ texto: "Digite a senha do certificado.", ok: false }]);
    const reais = escolhidas.filter((n) => n.ambiente === "PRODUCAO");
    if (reais.length > 0) {
      const total = reais.reduce((t, n) => t + n.valorCentavos, 0);
      const ok = window.confirm(
        `Assinar e emitir ${reais.length} NOTA(S) FISCAL(IS) REAL(IS), total ${moeda(total)}? Elas vão para a Receita e a prefeitura.`,
      );
      if (!ok) return;
    }
    setAssinando(true);
    setResultadoAssinatura(null);
    const res = await fetch("/api/nfse/assinar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: escolhidas.map((n) => n.id), senha }),
    });
    const json = await res.json().catch(() => ({}));
    setAssinando(false);
    setSenha("");
    if (!res.ok) {
      setResultadoAssinatura([{ texto: json.erro ?? "Não foi possível assinar.", ok: false }]);
    } else {
      const nomes = new Map(escolhidas.map((n) => [n.id, `${n.tomadorNome} (${moeda(n.valorCentavos)})`]));
      setResultadoAssinatura(
        (json.resultados ?? []).map(
          (r: {
            id: string;
            status: string;
            erro?: string;
            numeroNfse?: string;
            entrega?: { enviados: string[]; falhas: string[] };
          }) => {
            const quem = nomes.get(r.id) ?? "Nota";
            if (r.status === "EMITIDA") {
              const enviada = r.entrega?.enviados.length ? ` — enviada ao cliente por ${r.entrega.enviados.join(" e ")}` : "";
              const falha = r.entrega?.falhas.length ? ` (não entregue: ${r.entrega.falhas.join("; ")})` : "";
              return { texto: `${quem}: emitida, no ${r.numeroNfse ?? "-"}${enviada}${falha}`, ok: true };
            }
            if (r.status === "PROCESSANDO") return { texto: `${quem}: sem resposta da API — use "Verificar situação" na lista.`, ok: false };
            return { texto: `${quem}: ${r.status === "REJEITADA" ? "recusada" : "não assinada"} — ${r.erro}`, ok: false };
          },
        ),
      );
      setSelecionadas([]);
    }
    router.refresh();
  }

  async function acao(nota: NotaNaTela, corpo: Record<string, unknown>) {
    setAcaoNota(nota.id);
    setErroLista(null);
    const res = await fetch(`/api/nfse/${nota.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...corpo, senha }),
    });
    const json = await res.json().catch(() => ({}));
    setAcaoNota(null);
    setSenha("");
    if (!res.ok) return setErroLista(json.erro ?? "Não foi possível concluir.");
    setCancelandoId(null);
    setVerificandoId(null);
    setCancelamento({ motivo: "1", descricao: "" });
    router.refresh();
  }

  async function descartar(nota: NotaNaTela) {
    if (!window.confirm(`Descartar a nota de ${moeda(nota.valorCentavos)} para ${nota.tomadorNome}? Ela não foi emitida e sai da lista.`))
      return;
    setAcaoNota(nota.id);
    setErroLista(null);
    const res = await fetch(`/api/nfse/${nota.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setAcaoNota(null);
    if (!res.ok) setErroLista(json.erro ?? "Não foi possível descartar.");
    setSelecionadas((sel) => sel.filter((id) => id !== nota.id));
    router.refresh();
  }

  const senhaCampo = (
    <input
      type="password"
      className="campo"
      autoComplete="off"
      placeholder="Senha do certificado"
      value={senha}
      onChange={(e) => setSenha(e.target.value)}
    />
  );

  return (
    <div className="mt-6 grid gap-6">
      <section className="cartao">
        <h2 className="font-semibold">Preparar nota fiscal</h2>
        <p className="mt-1 text-xs text-slate-500">
          A nota fica aguardando a assinatura de {titularNome ?? "quem tiver o certificado"} — só o titular emite, com a
          senha do certificado.
        </p>
        {!pronto ? (
          <p className="mt-3 text-sm text-slate-500">Resolva as pendências do emissor acima para preparar notas.</p>
        ) : (
          <form onSubmit={preparar} className="mt-3 grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm md:col-span-2">
              Cliente (tomador do serviço)
              <select className="campo" value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
                <option value="">Escolha o cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} {c.documento ? `— ${c.documento}` : "(sem CPF/CNPJ)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Valor do serviço (R$)
              <input className="campo" inputMode="decimal" placeholder="0,00" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            </label>
            <label className="grid gap-1 text-sm">
              Data de competência (quando o serviço foi prestado)
              <input
                className="campo"
                type="date"
                max={hoje()}
                value={form.dataCompetencia}
                onChange={(e) => setForm({ ...form, dataCompetencia: e.target.value })}
              />
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              Descrição do serviço
              <textarea className="campo" rows={3} maxLength={2000} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              Informações complementares (opcional)
              <input
                className="campo"
                maxLength={2000}
                value={form.informacoesComplementares}
                onChange={(e) => setForm({ ...form, informacoesComplementares: e.target.value })}
              />
            </label>
            <div className="flex flex-wrap gap-4 text-sm md:col-span-2">
              <span className="text-slate-600">Depois de emitida, mandar ao cliente por:</span>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.email} onChange={(e) => setForm({ ...form, email: e.target.checked })} />
                e-mail
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.checked })} />
                WhatsApp
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3 md:col-span-2">
              <button type="submit" className="botao-principal" disabled={preparando}>
                {preparando ? "Preparando..." : producao ? "Enviar para assinatura" : "Enviar nota de teste para assinatura"}
              </button>
              {!producao ? <span className="text-xs text-slate-500">Ambiente de testes do governo: a nota não tem valor fiscal.</span> : null}
            </div>
          </form>
        )}
        {resultado ? (
          <div
            className={`mt-4 rounded-md border p-3 text-sm ${resultado.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}
          >
            <p>{resultado.texto}</p>
            {resultado.avisos.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-amber-900">
                {resultado.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      {paraAssinar.length > 0 ? (
        <section className="cartao border-amber-200">
          <h2 className="font-semibold">Aguardando assinatura</h2>
          <p className="mt-1 text-xs text-slate-500">
            Só {titularNome ?? "o titular do certificado"} assina. A senha do certificado e pedida a cada assinatura e não
            fica guardada.
          </p>
          <ul className="mt-3 divide-y divide-slate-100">
            {paraAssinar.map((n) => (
              <li key={n.id} className="flex flex-wrap items-start gap-3 py-2">
                {souTitular ? (
                  <input
                    type="checkbox"
                    className="mt-1"
                    aria-label={`Selecionar nota de ${n.tomadorNome}`}
                    checked={selecionadas.includes(n.id)}
                    onChange={(e) => setSelecionadas((sel) => (e.target.checked ? [...sel, n.id] : sel.filter((id) => id !== n.id)))}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm">
                    {n.tomadorNome} — <span className="tabular-nums">{moeda(n.valorCentavos)}</span>
                    {n.ambiente !== "PRODUCAO" ? <span className="ml-2 rounded bg-slate-100 px-1.5 text-xs text-slate-600">Teste</span> : null}
                    {n.status === "REJEITADA" ? (
                      <span className="ml-2 rounded bg-red-100 px-1.5 text-xs text-red-800">Recusada — corrigir e assinar de novo</span>
                    ) : null}
                  </p>
                  <p className="break-words text-xs text-slate-500">
                    {n.descricao.slice(0, 120)} · competencia {n.dataCompetencia}
                    {n.vaiAoCliente ? " · vai ao cliente depois de emitida" : ""}
                  </p>
                  {n.status === "REJEITADA" && n.erros.length > 0 ? (
                    <p className="mt-1 break-words text-xs text-red-700">{erroEmTexto(n.erros)}</p>
                  ) : null}
                </div>
                <button type="button" className="text-xs text-red-700 hover:underline" disabled={acaoNota === n.id} onClick={() => descartar(n)}>
                  Descartar
                </button>
              </li>
            ))}
          </ul>
          {souTitular ? (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-sm">
                Senha do certificado (e-CNPJ)
                {senhaCampo}
              </label>
              <button type="button" className="botao-principal" disabled={assinando || selecionadas.length === 0} onClick={assinar}>
                {assinando ? "Assinando..." : `Assinar e emitir (${selecionadas.length})`}
              </button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-amber-900">Aguardando a assinatura de {titularNome ?? "titular do certificado"}.</p>
          )}
          {resultadoAssinatura ? (
            <ul className="mt-3 grid gap-1 text-sm">
              {resultadoAssinatura.map((r, i) => (
                <li key={i} className={`break-words ${r.ok ? "text-emerald-700" : "text-red-700"}`}>
                  {r.texto}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="cartao">
        <h2 className="font-semibold">Notas emitidas</h2>
        {erroLista ? <p className="mt-2 text-sm text-red-700">{erroLista}</p> : null}
        {transmitidas.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nenhuma nota emitida ainda.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 pr-3">Data</th>
                  <th className="py-2 pr-3">No</th>
                  <th className="py-2 pr-3">Tomador</th>
                  <th className="py-2 pr-3 text-right">Valor</th>
                  <th className="py-2 pr-3">Situação</th>
                  <th className="py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {transmitidas.map((n) => (
                  <tr key={n.id} className="border-b border-slate-100 align-top">
                    <td className="whitespace-nowrap py-2 pr-3">{n.criadaEm}</td>
                    <td className="whitespace-nowrap py-2 pr-3">
                      {n.numeroNfse ?? "-"}
                      {n.numeroDps !== null ? <div className="text-xs text-slate-500">DPS {n.numeroDps}</div> : null}
                    </td>
                    <td className="min-w-[10rem] py-2 pr-3">
                      {n.tomadorNome}
                      <div className="break-words text-xs text-slate-500">{n.descricao.slice(0, 80)}</div>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{moeda(n.valorCentavos)}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${STATUS[n.status]?.classe ?? ""}`}>
                        {STATUS[n.status]?.texto ?? n.status}
                      </span>
                      {n.ambiente !== "PRODUCAO" ? <span className="ml-1 rounded bg-slate-100 px-1.5 text-xs text-slate-600">Teste</span> : null}
                      {n.status === "CANCELADA" && n.motivoCancelamento ? (
                        <div className="mt-1 text-xs text-slate-500">{n.motivoCancelamento}</div>
                      ) : null}
                      {n.status === "PROCESSANDO" && n.erros.length > 0 ? (
                        <div className="mt-1 break-words text-xs text-amber-900">{erroEmTexto(n.erros)}</div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap py-2">
                      <div className="flex flex-col items-start gap-1">
                        {n.temXml ? (
                          <>
                            <a className="text-xs text-marca hover:underline" href={`/api/nfse/${n.id}/pdf`} target="_blank" rel="noreferrer">
                              PDF
                            </a>
                            <a className="text-xs text-marca hover:underline" href={`/api/nfse/${n.id}/xml`}>
                              XML
                            </a>
                          </>
                        ) : null}
                        {n.status === "EMITIDA" && souTitular ? (
                          <button type="button" className="text-xs text-red-700 hover:underline" onClick={() => setCancelandoId(cancelandoId === n.id ? null : n.id)}>
                            Cancelar nota
                          </button>
                        ) : null}
                        {n.status === "PROCESSANDO" && souTitular ? (
                          <button type="button" className="text-xs text-marca hover:underline" onClick={() => setVerificandoId(verificandoId === n.id ? null : n.id)}>
                            Verificar situação
                          </button>
                        ) : null}
                      </div>
                      {verificandoId === n.id ? (
                        <div className="mt-2 grid w-64 gap-2 whitespace-normal">
                          {senhaCampo}
                          <button type="button" className="botao-secundario text-xs" disabled={acaoNota === n.id} onClick={() => acao(n, { acao: "VERIFICAR" })}>
                            {acaoNota === n.id ? "Verificando..." : "Consultar na API nacional"}
                          </button>
                        </div>
                      ) : null}
                      {cancelandoId === n.id ? (
                        <div className="mt-2 grid w-64 gap-2 whitespace-normal">
                          <select className="campo" value={cancelamento.motivo} onChange={(e) => setCancelamento({ ...cancelamento, motivo: e.target.value })}>
                            <option value="1">Erro na emissão</option>
                            <option value="2">Serviço não prestado</option>
                            <option value="9">Outros</option>
                          </select>
                          <textarea
                            className="campo"
                            rows={2}
                            placeholder="Explique o motivo (min. 15 caracteres)"
                            value={cancelamento.descricao}
                            onChange={(e) => setCancelamento({ ...cancelamento, descricao: e.target.value })}
                          />
                          {senhaCampo}
                          <button
                            type="button"
                            className="botao-secundario text-xs"
                            disabled={acaoNota === n.id}
                            onClick={() => acao(n, { acao: "CANCELAR", motivo: Number(cancelamento.motivo), descricao: cancelamento.descricao })}
                          >
                            {acaoNota === n.id ? "Cancelando..." : "Confirmar cancelamento"}
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
