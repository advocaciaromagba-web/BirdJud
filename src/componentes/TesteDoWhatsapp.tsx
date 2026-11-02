"use client";

import { useEffect, useRef, useState } from "react";

type Teste = { situacao: "AGUARDANDO" | "ENTREGUE" | "FALHOU" | "SEM_RESPOSTA"; telefone: string; enviadoEm: string; entregueEm: string | null; erro: string | null };

const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const TEXTO: Record<Teste["situacao"], (t: Teste) => { cor: string; texto: string }> = {
  AGUARDANDO: (t) => ({ cor: "text-slate-700", texto: `Enviado para ${t.telefone}. Esperando a Meta confirmar a entrega…` }),
  ENTREGUE: (t) => ({ cor: "text-emerald-700", texto: `Funcionando: a Meta confirmou a entrega em ${t.telefone}${t.entregueEm ? ` (${hora(t.entregueEm)})` : ""}.` }),
  FALHOU: (t) => ({ cor: "text-red-700", texto: `Não chegou: ${t.erro ?? "a Meta recusou a entrega."}` }),
  SEM_RESPOSTA: () => ({
    cor: "text-amber-800",
    texto: "A Meta aceitou, mas não confirmou a entrega em 5 minutos. É sintoma: avise a BirdJud (em geral é o retorno de status da Meta).",
  }),
};

/**
 * Testar o WhatsApp: manda uma mensagem ao SEU celular e espera o veredito da
 * Meta. "Aceito" nao basta — e exatamente o que esconde a mensagem que nunca
 * chega.
 */
export function TesteDoWhatsapp({ temCelular }: { temCelular: boolean }) {
  const [teste, setTeste] = useState<Teste | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);

  async function ler() {
    const r = await fetch("/api/whatsapp/teste").catch(() => null);
    const j = await r?.json().catch(() => null);
    if (j?.teste) setTeste(j.teste);
    return j?.teste as Teste | null;
  }

  useEffect(() => {
    void ler();
    return () => {
      if (relogio.current) clearInterval(relogio.current);
    };
  }, []);

  useEffect(() => {
    if (teste?.situacao !== "AGUARDANDO") {
      if (relogio.current) clearInterval(relogio.current);
      relogio.current = null;
      return;
    }
    if (!relogio.current) relogio.current = setInterval(() => void ler(), 4000);
  }, [teste?.situacao]);

  const mostrado = teste ? TEXTO[teste.situacao](teste) : null;
  return (
    <section className="cartao">
      <p className="sobretitulo">Comunicação</p>
      <h2 className="mt-1 text-lg font-bold">Testar o WhatsApp</h2>
      <p className="mt-2 leitura text-slate-600">
        Manda uma mensagem ao seu próprio celular, o do seu cadastro, e espera a Meta dizer se ela chegou. Só diz que está funcionando quando a entrega é
        confirmada: o &quot;aceito&quot; da Meta, sozinho, já escondeu dias de mensagens que nunca chegaram.
      </p>
      {!temCelular ? (
        <p className="mt-2 text-sm text-amber-800">Seu cadastro está sem celular: preencha em Minha conta para poder testar.</p>
      ) : null}
      <button
        type="button"
        className="botao-secundario mt-4"
        disabled={ocupado || !temCelular || teste?.situacao === "AGUARDANDO"}
        onClick={async () => {
          setOcupado(true);
          setErro(null);
          const r = await fetch("/api/whatsapp/teste", { method: "POST" }).catch(() => null);
          const j = await r?.json().catch(() => null);
          setOcupado(false);
          if (!r?.ok) {
            setErro(j?.erro ?? "Não consegui mandar o teste.");
            return;
          }
          setTeste(j.teste);
        }}
      >
        {ocupado ? "Mandando…" : "Mandar mensagem de teste"}
      </button>
      {erro ? <p className="mt-2 text-sm text-red-700">{erro}</p> : null}
      {mostrado ? (
        <p role="status" className={`mt-2 text-sm ${mostrado.cor}`}>
          {mostrado.texto}
          {teste ? <span className="block text-xs text-slate-500">Último teste: {hora(teste.enviadoEm)}</span> : null}
        </p>
      ) : null}
    </section>
  );
}
