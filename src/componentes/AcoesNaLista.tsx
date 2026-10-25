"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Dados = {
  nome: string;
  razaoSocial: string | null;
  cidade: string | null;
  telefoneAtendimento: string | null;
};

type Janela = "editar" | "suspender" | "liberar" | "avisar" | "excluir" | null;

/**
 * As acoes do operador sobre um escritorio, direto na linha da lista do
 * console (e no topo da ficha): editar os dados, suspender por atraso ou
 * liberar, mandar aviso de cobranca e excluir. Cada uma abre uma janela com
 * o que ela pede; nada acontece com um clique so.
 */
export function AcoesNaLista({
  id,
  slug,
  status,
  atraso,
  temAberta,
  dados,
  naFicha = false,
}: {
  id: string;
  slug: string;
  status: string;
  /** Dias de atraso da fatura mais antiga em aberto; nulo se nenhuma. */
  atraso: number | null;
  temAberta: boolean;
  dados: Dados;
  naFicha?: boolean;
}) {
  const router = useRouter();
  const caixa = useRef<HTMLDialogElement>(null);
  const [janela, setJanela] = useState<Janela>(null);
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [form, setForm] = useState({
    ...dados,
    razaoSocial: dados.razaoSocial ?? "",
    cidade: dados.cidade ?? "",
    telefoneAtendimento: dados.telefoneAtendimento ?? "",
    motivo: "",
    avisar: true,
    ate: "",
    confirmacao: "",
  });

  const encerrado = status === "ENCERRADO";
  const suspenso = status === "SUSPENSO";
  const podeSuspender = !encerrado && !suspenso && atraso !== null && atraso > 0;

  function abrir(j: Janela) {
    setRecado(null);
    setJanela(j);
    caixa.current?.showModal();
  }
  function fechar() {
    caixa.current?.close();
    setJanela(null);
  }

  async function enviar(corpo: Record<string, unknown>, fecharAoTerminar = true) {
    setOcupado(true);
    setRecado(null);
    const r = await fetch(`/api/plataforma/escritorios/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const json = (await r.json().catch(() => ({}))) as { erro?: string; detalhe?: string };
    setOcupado(false);
    const texto = json.detalhe ?? json.erro ?? (r.ok ? "Feito." : "Não deu certo.");
    if (!r.ok) {
      setRecado({ ok: false, texto });
      return;
    }
    if (corpo.acao === "excluir" && naFicha) {
      router.push("/plataforma/escritorios");
      return;
    }
    if (fecharAoTerminar) fechar();
    setRecado({ ok: true, texto });
    router.refresh();
  }

  const botao = "rounded border px-2 py-1 text-xs font-semibold transition hover:bg-slate-50 disabled:opacity-50";
  const titulo: Record<Exclude<Janela, null>, string> = {
    editar: "Editar dados do escritório",
    suspender: "Suspender por atraso",
    liberar: "Liberar o acesso",
    avisar: "Enviar aviso de cobrança",
    excluir: "Excluir definitivamente",
  };

  return (
    <div className={naFicha ? "flex flex-wrap items-center gap-2" : "ml-auto flex max-w-[24rem] flex-wrap justify-end gap-1.5"}>
      {!naFicha ? (
        <Link href={`/plataforma/${id}`} className={`${botao} border-slate-300 text-slate-700`}>
          Abrir
        </Link>
      ) : null}
      {!encerrado ? (
        <button type="button" className={`${botao} border-slate-300 text-slate-700`} onClick={() => abrir("editar")}>
          Editar
        </button>
      ) : null}
      {temAberta && !encerrado ? (
        <button type="button" className={`${botao} border-amber-300 text-amber-800`} onClick={() => abrir("avisar")}>
          Avisar
        </button>
      ) : null}
      {podeSuspender ? (
        <button type="button" className={`${botao} border-red-300 text-red-700`} onClick={() => abrir("suspender")}>
          Suspender
        </button>
      ) : null}
      {suspenso ? (
        <button type="button" className={`${botao} border-green-300 text-green-800`} onClick={() => abrir("liberar")}>
          Liberar
        </button>
      ) : null}
      <button type="button" className={`${botao} border-red-300 text-red-700`} onClick={() => abrir("excluir")}>
        Excluir
      </button>

      {recado && !janela ? (
        <span role="status" className={`basis-full text-right text-xs ${recado.ok ? "text-green-700" : "text-red-700"}`}>
          {recado.texto}
        </span>
      ) : null}

      <dialog
        ref={caixa}
        onClose={() => setJanela(null)}
        className="w-[min(32rem,calc(100vw-2rem))] rounded-xl p-0 text-left text-sm shadow-xl backdrop:bg-slate-900/40"
      >
        {janela ? (
          <form
            method="dialog"
            className="grid gap-3 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (janela === "editar")
                void enviar({
                  acao: "dados",
                  nome: form.nome,
                  razaoSocial: form.razaoSocial || null,
                  cidade: form.cidade || null,
                  telefoneAtendimento: form.telefoneAtendimento || null,
                });
              if (janela === "suspender") void enviar({ acao: "suspender", motivo: form.motivo, avisar: form.avisar });
              if (janela === "liberar") void enviar({ acao: "liberar", ...(form.ate ? { ate: form.ate } : {}) });
              if (janela === "avisar") void enviar({ acao: "avisar" });
              if (janela === "excluir") void enviar({ acao: "excluir", confirmacao: form.confirmacao, motivo: form.motivo });
            }}
          >
            <h2 className="text-lg">{titulo[janela]}</h2>
            <p className="-mt-2 text-xs text-slate-500">{dados.nome} · {slug}</p>

            {janela === "editar" ? (
              <>
                <label className="grid gap-1">
                  <span className="rotulo">Nome do escritório</span>
                  <input className="campo" required minLength={2} maxLength={120} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                </label>
                <label className="grid gap-1">
                  <span className="rotulo">Razão social</span>
                  <input className="campo" maxLength={200} value={form.razaoSocial} onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="rotulo">Cidade</span>
                    <input className="campo" maxLength={120} value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
                  </label>
                  <label className="grid gap-1">
                    <span className="rotulo">Telefone de atendimento</span>
                    <input className="campo" maxLength={30} value={form.telefoneAtendimento} onChange={(e) => setForm({ ...form, telefoneAtendimento: e.target.value })} />
                  </label>
                </div>
                <p className="text-xs text-slate-500">
                  O endereço ({slug}) não muda: é o link de entrada da equipe. Plano, faixa, mensalidade, CNPJ, cupom e
                  isenção ficam na{" "}
                  <Link href={`/plataforma/${id}`} className="underline">
                    ficha completa
                  </Link>
                  .
                </p>
              </>
            ) : null}

            {janela === "suspender" ? (
              <>
                <p className="text-slate-600">
                  Fatura vencida há {atraso} dia(s). Suspenso, ninguém da equipe entra no sistema; os dados ficam
                  guardados. O acesso volta sozinho quando tudo o que está vencido for pago, ou quando você liberar.
                </p>
                <label className="grid gap-1">
                  <span className="rotulo">Motivo (fica no registro, não vai ao cliente)</span>
                  <input className="campo" required minLength={5} maxLength={300} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.avisar} onChange={(e) => setForm({ ...form, avisar: e.target.checked })} />
                  Avisar o administrador do escritório por e-mail, com o link de pagamento
                </label>
              </>
            ) : null}

            {janela === "liberar" ? (
              <>
                <p className="text-slate-600">
                  {atraso !== null && atraso >= 15
                    ? `O atraso é de ${atraso} dias: sem um prazo, a régua suspende de novo na hora. Informe até quando o acesso fica liberado (pagamento combinado).`
                    : "O acesso volta agora. Com um prazo, a régua não suspende de novo até essa data."}
                </p>
                <label className="grid gap-1">
                  <span className="rotulo">Liberado até (opcional)</span>
                  <input type="date" className="campo" value={form.ate} onChange={(e) => setForm({ ...form, ate: e.target.value })} />
                </label>
              </>
            ) : null}

            {janela === "avisar" ? (
              <p className="text-slate-600">
                Manda agora ao(s) administrador(es) do escritório um e-mail com a fatura em aberto, o link de pagamento
                e a data em que o acesso será suspenso. Os avisos automáticos continuam saindo pela régua.
              </p>
            ) : null}

            {janela === "excluir" ? (
              <>
                <p className="text-slate-600">
                  Não se desfaz. Sem fatura paga, some tudo e o endereço fica livre. Com fatura paga ou nota emitida, ficam
                  só faturas, assinatura, aceites e notas (registro fiscal). Boleto em aberto é cancelado no Asaas antes.
                </p>
                <label className="grid gap-1">
                  <span className="rotulo">Digite o endereço para confirmar: {slug}</span>
                  <input className="campo" required value={form.confirmacao} onChange={(e) => setForm({ ...form, confirmacao: e.target.value })} />
                </label>
                <label className="grid gap-1">
                  <span className="rotulo">Motivo (fica registrado)</span>
                  <input className="campo" required minLength={10} maxLength={300} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
                </label>
              </>
            ) : null}

            {recado ? <p className={recado.ok ? "text-green-700" : "text-red-700"}>{recado.texto}</p> : null}

            <div className="mt-1 flex justify-end gap-2">
              <button type="button" className="botao-discreto" onClick={fechar}>
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  ocupado ||
                  (janela === "excluir" && (form.confirmacao.trim().toLowerCase() !== slug || form.motivo.trim().length < 10)) ||
                  (janela === "suspender" && form.motivo.trim().length < 5)
                }
                className={janela === "excluir" || janela === "suspender" ? "rounded bg-red-700 px-3 py-1.5 font-semibold text-white disabled:opacity-50" : "botao-principal"}
              >
                {ocupado
                  ? "Aguarde…"
                  : { editar: "Salvar", suspender: "Suspender", liberar: "Liberar", avisar: "Enviar aviso", excluir: "Excluir definitivamente" }[janela]}
              </button>
            </div>
          </form>
        ) : null}
      </dialog>
    </div>
  );
}
