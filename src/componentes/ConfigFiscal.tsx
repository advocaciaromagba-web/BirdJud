"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LeitorDeDocumentos } from "./LeitorDeDocumentos";

export type FiscalNaTela = {
  razaoSocial: string;
  cnpj: string;
  inscricaoMunicipal: string;
  codigoMunicipio: string;
  telefone: string;
  email: string;
  opSimpNac: number;
  regEspTrib: number;
  pTotTribSN: string;
  pTotTribFed: string;
  pTotTribEst: string;
  pTotTribMun: string;
  regimeFuturoDesde: string;
  futuroOpSimpNac: number;
  futuroRegEspTrib: number;
  futuroPTotTribSN: string;
  futuroPTotTribFed: string;
  futuroPTotTribEst: string;
  futuroPTotTribMun: string;
  ibsCbsDesde: string;
  cIndOp: string;
  cstIbsCbs: string;
  cClassTribIbsCbs: string;
  regApIBSCBSSN: string;
  cAtvSN: string;
  codigoTributacao: string;
  codigoNbs: string;
  descricaoPadrao: string;
  serie: string;
  proximoNumero: number;
  ambiente: string;
};

/**
 * Cadastro do escritorio emissor. O regime do ISS e mostrado em linguagem de
 * escritorio — "dentro do DAS" ou "ISS fixo de sociedade de profissionais" —
 * e convertido nos codigos do leiaute nacional, que tem uma combinacao
 * obrigatoria (regra E0175) facil de errar se preenchidos soltos.
 */
export function ConfigFiscal({ fiscal, temIA }: { fiscal: FiscalNaTela | null; temIA: boolean }) {
  const router = useRouter();
  const e = fiscal;
  const inicial = {
    razaoSocial: e?.razaoSocial ?? "",
    cnpj: e?.cnpj ?? "",
    inscricaoMunicipal: e?.inscricaoMunicipal ?? "",
    codigoMunicipio: e?.codigoMunicipio ?? "",
    telefone: e?.telefone ?? "",
    email: e?.email ?? "",
    simples: e && e.opSimpNac === 1 ? "NAO" : "SIM",
    modoIss: e && e.regEspTrib === 6 ? "FIXO" : "DAS",
    pTotTribSN: e?.pTotTribSN ?? "",
    pTotTribFed: e?.pTotTribFed ?? "",
    pTotTribEst: e?.pTotTribEst ?? "",
    pTotTribMun: e?.pTotTribMun ?? "",
    codigoTributacao: e?.codigoTributacao ?? "171401",
    codigoNbs: e?.codigoNbs ?? "113012000",
    descricaoPadrao: e?.descricaoPadrao ?? "Prestacao de servicos advocaticios",
    serie: e?.serie ?? "1",
    proximoNumero: String(e?.proximoNumero ?? 1),
    ambiente: e?.ambiente ?? "HOMOLOGACAO",
    regimeFuturoDesde: e?.regimeFuturoDesde ?? "",
    futuroSimples: e?.futuroOpSimpNac === 1 ? "NAO" : "SIM",
    futuroModoIss: e?.futuroRegEspTrib === 6 ? "FIXO" : "DAS",
    futuroPTotTribSN: e?.futuroPTotTribSN ?? "",
    futuroPTotTribFed: e?.futuroPTotTribFed ?? "",
    futuroPTotTribEst: e?.futuroPTotTribEst ?? "",
    futuroPTotTribMun: e?.futuroPTotTribMun ?? "",
    ibsCbsDesde: e?.ibsCbsDesde || "2027-01-01",
    cIndOp: e?.cIndOp ?? "100301",
    cstIbsCbs: e?.cstIbsCbs ?? "000",
    cClassTribIbsCbs: e?.cClassTribIbsCbs ?? "000001",
    regApIBSCBSSN: e?.regApIBSCBSSN ?? "",
    cAtvSN: e?.cAtvSN ?? "",
  };
  const [form, setForm] = useState(inicial);
  const [aberto, setAberto] = useState(!fiscal);
  const [mudaRegime, setMudaRegime] = useState(Boolean(e?.regimeFuturoDesde));
  const [usaIbsCbs, setUsaIbsCbs] = useState(Boolean(e?.ibsCbsDesde));
  const [salvando, setSalvando] = useState(false);
  const [lidoPelaIA, setLidoPelaIA] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; tipo: "ok" | "erro" } | null>(null);
  const set = (campo: keyof typeof form, valor: string) => setForm((f) => ({ ...f, [campo]: valor }));

  function aplicarLeitura(c: Record<string, string>) {
    setForm((f) => ({
      ...f,
      razaoSocial: c.razaoSocial ?? f.razaoSocial,
      cnpj: c.cnpj ?? f.cnpj,
      inscricaoMunicipal: c.inscricaoMunicipal ?? f.inscricaoMunicipal,
      codigoMunicipio: c.codigoMunicipio ?? f.codigoMunicipio,
      codigoTributacao: c.codigoTributacao ?? f.codigoTributacao,
      simples: c.regime ? (c.regime === "NORMAL" ? "NAO" : "SIM") : f.simples,
    }));
    setLidoPelaIA(true);
  }

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    if (form.ambiente === "PRODUCAO" && e?.ambiente !== "PRODUCAO") {
      const ok = window.confirm(
        "Passar para PRODUCAO: a partir daqui cada nota emitida tem validade fiscal real e vai para a Receita e a prefeitura. " +
          "Confirme que o contador validou o regime do ISS e o percentual de tributos. Continuar?",
      );
      if (!ok) return;
    }
    setSalvando(true);
    setMsg(null);
    const opSimpNac = form.simples === "NAO" ? 1 : 3;
    const futuroOp = form.futuroSimples === "NAO" ? 1 : 3;
    const res = await fetch("/api/nfse", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        acao: "CADASTRO",
        dados: {
          razaoSocial: form.razaoSocial,
          cnpj: form.cnpj,
          inscricaoMunicipal: form.inscricaoMunicipal || null,
          codigoMunicipio: form.codigoMunicipio.replace(/\D/g, ""),
          telefone: form.telefone || null,
          email: form.email || null,
          opSimpNac,
          regApTribSN: opSimpNac === 3 ? (form.modoIss === "FIXO" ? 2 : 1) : null,
          regEspTrib: form.modoIss === "FIXO" ? 6 : 0,
          pTotTribSN: form.pTotTribSN,
          pTotTribFed: form.pTotTribFed,
          pTotTribEst: form.pTotTribEst,
          pTotTribMun: form.pTotTribMun,
          // So manda a mudanca de regime quando ela esta marcada — sem isso, a data vai vazia e a mudanca e apagada.
          regimeFuturoDesde: mudaRegime ? form.regimeFuturoDesde : null,
          regimeFuturo: mudaRegime
            ? {
                opSimpNac: futuroOp,
                regApTribSN: futuroOp === 3 ? (form.futuroModoIss === "FIXO" ? 2 : 1) : null,
                regEspTrib: form.futuroModoIss === "FIXO" ? 6 : 0,
                pTotTribSN: form.futuroPTotTribSN || null,
                pTotTribFed: form.futuroPTotTribFed || null,
                pTotTribEst: form.futuroPTotTribEst || null,
                pTotTribMun: form.futuroPTotTribMun || null,
              }
            : null,
          // Sem a marcacao, a data vai vazia e a nota continua sem IBS/CBS.
          ibsCbsDesde: usaIbsCbs ? form.ibsCbsDesde : null,
          cIndOp: form.cIndOp || null,
          cstIbsCbs: form.cstIbsCbs || null,
          cClassTribIbsCbs: form.cClassTribIbsCbs || null,
          regApIBSCBSSN: form.regApIBSCBSSN ? Number(form.regApIBSCBSSN) : null,
          cAtvSN: form.cAtvSN ? Number(form.cAtvSN) : null,
          codigoTributacao: form.codigoTributacao.replace(/\D/g, ""),
          codigoNbs: form.codigoNbs.replace(/\D/g, "") || null,
          descricaoPadrao: form.descricaoPadrao || null,
          serie: form.serie.replace(/\D/g, "") || "1",
          proximoNumero: Number(form.proximoNumero) || 1,
          ambiente: form.ambiente,
        },
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) return setMsg({ texto: json.erro ?? "Nao foi possivel salvar.", tipo: "erro" });
    setMsg({ texto: "Configuracao salva.", tipo: "ok" });
    setLidoPelaIA(false);
    router.refresh();
  }

  const campo = (rotulo: string, nome: keyof typeof form, extra: { placeholder?: string; ajuda?: string } = {}) => (
    <label className="grid gap-1 text-sm">
      {rotulo}
      <input
        className="campo"
        value={form[nome]}
        placeholder={extra.placeholder}
        onChange={(x) => set(nome, x.target.value)}
      />
      {extra.ajuda ? <span className="text-xs text-slate-500">{extra.ajuda}</span> : null}
    </label>
  );

  return (
    <details className="mt-4" open={aberto} onToggle={(ev) => setAberto((ev.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-sm font-semibold text-marca">
        Configurar emissor {fiscal ? "" : "(obrigatorio antes da primeira nota)"}
      </summary>

      {temIA ? (
        <div className="mt-3">
          <LeitorDeDocumentos perfil="FISCAL" aoAplicar={aplicarLeitura} />
        </div>
      ) : null}
      {lidoPelaIA ? (
        <p className="mt-3 rounded-lg border-2 border-violet-300 bg-violet-50 p-3 text-sm font-semibold text-violet-900">
          Sugestao da IA no formulario abaixo: confira cada campo, e o regime, o codigo do servico e os percentuais com o
          contador, antes de salvar.
        </p>
      ) : null}

      <form onSubmit={salvar} className="mt-3 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">{campo("Razao social", "razaoSocial")}</div>
        {campo("CNPJ", "cnpj")}
        {campo("Inscricao municipal", "inscricaoMunicipal", { placeholder: "Se a prefeitura exigir" })}
        {campo("Codigo IBGE do municipio (sede)", "codigoMunicipio", { ajuda: "7 digitos." })}
        {campo("Telefone (na nota)", "telefone")}
        <div className="md:col-span-2">{campo("E-mail (na nota)", "email")}</div>

        <fieldset className="grid gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 md:col-span-2">
          <legend className="px-1 text-sm font-semibold">Regime tributario e ISS</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={form.simples === "SIM"} onChange={() => set("simples", "SIM")} />
              Optante do Simples Nacional (ME/EPP)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={form.simples === "NAO"} onChange={() => set("simples", "NAO")} />
              Nao optante (lucro presumido ou real)
            </label>
          </div>
          <p className="text-xs text-slate-600">A Receita confere: se nao bater com o cadastro dela, a nota e recusada (E0160).</p>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" className="mt-1" checked={form.modoIss === "DAS"} onChange={() => set("modoIss", "DAS")} />
            <span>
              {form.simples === "SIM" ? (
                <>
                  <strong>ISS dentro do DAS</strong> — o ISS vai junto na guia mensal do Simples.
                </>
              ) : (
                <>
                  <strong>ISS normal</strong> — calculado sobre o valor de cada nota, sem regime especial.
                </>
              )}
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" className="mt-1" checked={form.modoIss === "FIXO"} onChange={() => set("modoIss", "FIXO")} />
            <span>
              <strong>ISS fixo anual — sociedade de profissionais</strong> — ISS pago a prefeitura por valor fixo. A nota
              sai com o regime especial &quot;Sociedade de Profissionais&quot;.
            </span>
          </label>
          {form.simples === "SIM" ? (
            <div className="max-w-xs">
              {campo("% aproximado de tributos do Simples (Lei 12.741)", "pTotTribSN", { placeholder: "ex: 6,00" })}
            </div>
          ) : (
            <div className="grid max-w-lg grid-cols-3 gap-3">
              {campo("% federais", "pTotTribFed", { placeholder: "14,53" })}
              {campo("% estaduais", "pTotTribEst", { placeholder: "0,00" })}
              {campo("% municipais", "pTotTribMun", { placeholder: "2,00" })}
            </div>
          )}
          <p className="text-xs text-amber-900">Confirme o regime e os percentuais com o contador antes de emitir em producao.</p>
        </fieldset>

        <fieldset className="grid gap-2 rounded-md border border-slate-200 p-3 md:col-span-2">
          <legend className="px-1 text-sm font-semibold">Mudanca de regime em data marcada</legend>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={mudaRegime} onChange={(x) => setMudaRegime(x.target.checked)} />
            <span>
              O escritorio muda de regime numa data certa (ex.: entra no Simples em 1/1). O sistema passa a usar o novo
              regime sozinho, pela <strong>competencia</strong> de cada nota.
            </span>
          </label>
          {mudaRegime ? (
            <div className="grid gap-2 pl-6">
              <label className="grid max-w-xs gap-1 text-sm">
                A partir de
                <input type="date" className="campo" value={form.regimeFuturoDesde} onChange={(x) => set("regimeFuturoDesde", x.target.value)} />
              </label>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={form.futuroSimples === "SIM"} onChange={() => set("futuroSimples", "SIM")} />
                  Passa a ser optante do Simples
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={form.futuroSimples === "NAO"} onChange={() => set("futuroSimples", "NAO")} />
                  Passa a ser nao optante
                </label>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={form.futuroModoIss === "DAS"} onChange={() => set("futuroModoIss", "DAS")} />
                  {form.futuroSimples === "SIM" ? "ISS dentro do DAS" : "ISS normal"}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={form.futuroModoIss === "FIXO"} onChange={() => set("futuroModoIss", "FIXO")} />
                  ISS fixo — sociedade de profissionais
                </label>
              </div>
              {form.futuroSimples === "SIM" ? (
                <div className="max-w-xs">{campo("% aproximado de tributos do Simples", "futuroPTotTribSN")}</div>
              ) : (
                <div className="grid max-w-lg grid-cols-3 gap-3">
                  {campo("% federais", "futuroPTotTribFed")}
                  {campo("% estaduais", "futuroPTotTribEst")}
                  {campo("% municipais", "futuroPTotTribMun")}
                </div>
              )}
            </div>
          ) : null}
        </fieldset>

        <fieldset className="grid gap-2 rounded-md border border-slate-200 p-3 md:col-span-2">
          <legend className="px-1 text-sm font-semibold">IBS e CBS (reforma tributaria)</legend>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={usaIbsCbs} onChange={(x) => setUsaIbsCbs(x.target.checked)} />
            <span>
              A nota passa a declarar IBS e CBS a partir de uma competencia. Para optante do Simples isso e obrigatorio
              desde 1/1/2027; antes de 1/1/2026 a Receita recusa a nota. Os valores sao calculados pela Receita — o
              sistema declara o tipo da operacao.
            </span>
          </label>
          {usaIbsCbs ? (
            <div className="grid gap-3 pl-6 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                A partir da competencia
                <input type="date" className="campo" value={form.ibsCbsDesde} onChange={(x) => set("ibsCbsDesde", x.target.value)} />
              </label>
              {campo("Codigo da operacao", "cIndOp", { ajuda: "100301 = demais servicos, operacao onerosa." })}
              {campo("Situacao tributaria (CST)", "cstIbsCbs", { ajuda: "000 = tributacao integral." })}
              {campo("Classificacao tributaria", "cClassTribIbsCbs", { ajuda: "000001 = tributada integralmente." })}
              <label className="grid gap-1 text-sm">
                Apuracao do IBS/CBS no Simples
                <select className="campo" value={form.regApIBSCBSSN} onChange={(x) => set("regApIBSCBSSN", x.target.value)}>
                  <option value="">Nao informar por enquanto</option>
                  <option value="1">1 — IBS e CBS dentro do Simples (DAS)</option>
                  <option value="2">2 — CBS no Simples e IBS por fora</option>
                  <option value="3">3 — IBS e CBS por fora do Simples</option>
                </select>
              </label>
              {campo("Codigo da atividade no Simples", "cAtvSN", { placeholder: "14", ajuda: "14 = servicos do Anexo IV (advocacia)." })}
              <p className="text-xs text-amber-900 sm:col-span-2">
                Os dois ultimos campos sao da Nota Tecnica 009: so preencha quando a Receita publicar o novo esquema. Em
                branco, a nota sai sem eles. Com IBS/CBS, o cliente precisa de endereco completo com CEP no cadastro.
              </p>
            </div>
          ) : null}
        </fieldset>

        {campo("Codigo de tributacao nacional", "codigoTributacao", { ajuda: "171401 = advocacia." })}
        {campo("Codigo NBS", "codigoNbs", { ajuda: "113012000 = representacao e consultoria juridica." })}
        <div className="md:col-span-2">{campo("Descricao padrao do servico", "descricaoPadrao")}</div>
        {campo("Serie da DPS", "serie")}
        {campo("Numero da proxima DPS", "proximoNumero")}

        <fieldset className="grid gap-2 rounded-md border border-slate-200 p-3 md:col-span-2">
          <legend className="px-1 text-sm font-semibold">Ambiente</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={form.ambiente === "HOMOLOGACAO"} onChange={() => set("ambiente", "HOMOLOGACAO")} />
            Testes (producao restrita) — nota sem validade juridica, para conferir tudo antes
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={form.ambiente === "PRODUCAO"} onChange={() => set("ambiente", "PRODUCAO")} />
            <span className="font-semibold text-red-700">Producao — nota fiscal real</span>
          </label>
        </fieldset>

        <div className="md:col-span-2">
          <button type="submit" className="botao-principal" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar configuracao"}
          </button>
          {msg ? <span className={`ml-3 text-sm ${msg.tipo === "erro" ? "text-red-700" : "text-emerald-700"}`}>{msg.texto}</span> : null}
        </div>
      </form>
    </details>
  );
}
