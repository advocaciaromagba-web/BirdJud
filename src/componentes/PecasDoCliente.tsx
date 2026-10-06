"use client";

import { useState } from "react";

const ESPECIES = [
  { chave: "CONTRATO", rotulo: "Contrato de honorarios" },
  { chave: "PROCURACAO", rotulo: "Procuracao" },
  { chave: "DECLARACAO", rotulo: "Declaracao de hipossuficiencia" },
  { chave: "RECIBO", rotulo: "Recibo de pagamento de honorarios" },
];

type Previa = {
  especie: string;
  texto: string;
  semValor: string[];
  desconhecidos: string[];
  doEscritorio: boolean;
};

/**
 * Gerar os documentos deste cliente.
 *
 * Marca-se o que precisa e sai de uma vez. Quase sempre sao os tres juntos —
 * contrato, procuracao e declaracao — e obrigar tres idas a tela para o que e
 * um gesto so era pedir que alguem esquecesse um.
 *
 * A previa vem ANTES do download, e nao depois: o que a peca tem de errado —
 * campo sem valor no cadastro, campo que nao existe — tem de aparecer enquanto
 * ainda da para arrumar, nao no papel que o cliente ja assinou.
 */
export function PecasDoCliente({ clienteId }: { clienteId: string }) {
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [previas, setPrevias] = useState<Previa[]>([]);
  const [recibo, setRecibo] = useState({ valor: "", referenteA: "", forma: "", data: "" });

  const quer = (e: string) => marcadas.has(e);
  function alternar(e: string) {
    setMarcadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(e)) novo.delete(e);
      else novo.add(e);
      return novo;
    });
  }

  function corpoDoPedido(especie: string, previa: boolean) {
    return JSON.stringify({
      clienteId,
      previa,
      ...(especie === "RECIBO"
        ? {
            reciboValor: recibo.valor || null,
            reciboReferenteA: recibo.referenteA || null,
            reciboForma: recibo.forma || null,
            reciboData: recibo.data || null,
          }
        : {}),
    });
  }

  const escolhidas = ESPECIES.filter((e) => quer(e.chave));

  async function conferir() {
    setOcupado(true);
    setErro(null);
    setPrevias([]);
    const achadas: Previa[] = [];

    for (const e of escolhidas) {
      const resposta = await fetch(`/api/modelos/${e.chave}/peca`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: corpoDoPedido(e.chave, true),
      });
      const det = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setOcupado(false);
        setErro(`${e.rotulo}: ${det?.erro ?? "nao consegui montar."}`);
        return;
      }
      achadas.push({ especie: e.rotulo, ...det });
    }
    setOcupado(false);
    setPrevias(achadas);
  }

  async function baixar() {
    setOcupado(true);
    setErro(null);

    // Um arquivo por documento, nao um pacote: cada peca vai para um lugar
    // diferente — uma para assinar, outra para juntar aos autos.
    for (const e of escolhidas) {
      const resposta = await fetch(`/api/modelos/${e.chave}/peca`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: corpoDoPedido(e.chave, false),
      });
      if (!resposta.ok) {
        const det = await resposta.json().catch(() => null);
        setOcupado(false);
        setErro(`${e.rotulo}: ${det?.erro ?? "nao consegui montar."}`);
        return;
      }
      const nome =
        /filename="([^"]+)"/.exec(resposta.headers.get("content-disposition") ?? "")?.[1] ??
        `${e.chave.toLowerCase()}.docx`;
      const url = URL.createObjectURL(await resposta.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      a.click();
      URL.revokeObjectURL(url);
      // O navegador ignora downloads disparados juntos demais.
      await new Promise((ok) => setTimeout(ok, 350));
    }
    setOcupado(false);
  }

  return (
    <section className="cartao mt-6">
      <h2 className="font-semibold">Gerar documentos</h2>
      <p className="mt-1 text-sm text-slate-600">
        Marque o que precisa. Sai no modelo do escritorio, com os dados deste
        cliente e do contrato de honorarios dele. O que falta no cadastro
        aparece marcado na peca — confira antes de imprimir.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {ESPECIES.map((e) => (
          <label
            key={e.chave}
            className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={quer(e.chave)}
              onChange={() => alternar(e.chave)}
            />
            {e.rotulo}
          </label>
        ))}
      </div>

      {quer("RECIBO") ? (
        <div className="mt-3 grid gap-3 rounded border border-slate-200 p-3 sm:grid-cols-2">
          <p className="text-xs text-slate-600 sm:col-span-2">
            Em branco, o recibo sai da ultima cobranca paga deste cliente. Dinheiro
            que entrou por fora do sistema precisa ser digitado: inventar o numero
            de um recibo seria dar quitacao de um valor que ninguem conferiu.
          </p>
          <div>
            <label className="rotulo" htmlFor="rec-valor">
              Valor recebido (R$)
            </label>
            <input
              id="rec-valor"
              className="campo"
              inputMode="decimal"
              value={recibo.valor}
              onChange={(e) => setRecibo({ ...recibo, valor: e.target.value })}
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="rec-data">
              Data do pagamento
            </label>
            <input
              id="rec-data"
              className="campo"
              type="date"
              value={recibo.data}
              onChange={(e) => setRecibo({ ...recibo, data: e.target.value })}
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="rec-ref">
              Referente a
            </label>
            <input
              id="rec-ref"
              className="campo"
              maxLength={200}
              placeholder="honorarios da acao trabalhista"
              value={recibo.referenteA}
              onChange={(e) => setRecibo({ ...recibo, referenteA: e.target.value })}
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="rec-forma">
              Como foi pago
            </label>
            <input
              id="rec-forma"
              className="campo"
              maxLength={40}
              placeholder="Pix"
              value={recibo.forma}
              onChange={(e) => setRecibo({ ...recibo, forma: e.target.value })}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={ocupado || escolhidas.length === 0}
          onClick={conferir}
          className="botao-secundario disabled:opacity-50"
        >
          {ocupado ? "..." : "Conferir"}
        </button>
        <button
          type="button"
          disabled={ocupado || escolhidas.length === 0}
          onClick={baixar}
          className="botao-principal disabled:opacity-50"
        >
          {escolhidas.length > 1 ? `Baixar os ${escolhidas.length}` : "Baixar"}
        </button>
      </div>

      {erro ? <p className="aviso-erro mt-3">{erro}</p> : null}

      {previas.map((p) => (
        <div key={p.especie} className="mt-4 border-t border-slate-200 pt-4">
          <p className="text-sm font-medium">{p.especie}</p>
          <p className="text-xs text-slate-500">
            {p.doEscritorio
              ? "Modelo do escritorio."
              : "Modelo que ja vem no sistema — pode ser trocado em Modelos."}
          </p>
          {p.semValor.length > 0 ? (
            <p className="mt-1 text-xs text-amber-700">
              Sem valor no cadastro, e por isso marcado na peca: {p.semValor.join(", ")}.
            </p>
          ) : null}
          {p.desconhecidos.length > 0 ? (
            <p className="mt-1 text-xs text-amber-700">
              O modelo pede campos que o sistema nao conhece:{" "}
              {p.desconhecidos.map((d) => `{{${d}}}`).join(", ")}.
            </p>
          ) : null}
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs text-slate-700">
            {p.texto}
          </pre>
        </div>
      ))}
    </section>
  );
}
