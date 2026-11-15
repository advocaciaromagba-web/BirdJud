"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Panorama = {
  canais: { email: boolean; whatsapp: boolean; semEmail: string | null; semWhatsapp: string | null };
  temTelefone: boolean;
  semCodigo: number;
  comCodigo: number;
  naoAvisados: number;
  emCampanha: number;
  concluiram: number;
};

/**
 * So o administrador ve: o primeiro aviso a carteira inteira e o arquivo de
 * contatos. As duas coisas alcancam todos os clientes de uma vez, por isso
 * mostram o panorama antes e pedem confirmacao digitada.
 */
export function CampanhaDoCodigo({ panorama: p, totalDeAvisos }: { panorama: Panorama; totalDeAvisos: number }) {
  const router = useRouter();
  const [confirmacao, setConfirmacao] = useState("");
  const [rodando, setRodando] = useState(false);
  const [andamento, setAndamento] = useState<string | null>(null);
  const [falhas, setFalhas] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const semCanal = !p.canais.email && !p.canais.whatsapp;
  const pronto = confirmacao.trim().toUpperCase() === "ENVIAR" && p.temTelefone && !semCanal;

  async function disparar(soEmail: boolean) {
    setRodando(true);
    setErro(null);
    setFalhas([]);
    let avisados = 0;
    try {
      // Pedaco a pedaco: para quando acaba ou quando nada anda (erro que
      // atinge todos nao pode deixar a tela girando).
      for (let volta = 0; volta < 500; volta++) {
        const r = await fetch("/api/codigos/lote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ soEmail, confirmacao: "ENVIAR" }),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j) {
          setErro(j?.erro ?? "A conexão caiu no meio do envio. O que já saiu não sai de novo: pode repetir.");
          break;
        }
        avisados += j.avisados;
        if (j.falhas?.length) setFalhas((f) => [...f, ...j.falhas].slice(0, 30));
        setAndamento(`${avisados} cliente(s) avisado(s); faltam ${j.faltam}.`);
        if (!j.progrediu || j.faltam === 0) break;
      }
    } finally {
      setRodando(false);
      setConfirmacao("");
      router.refresh();
    }
  }

  return (
    <section className="cartao mt-8">
      <p className="sobretitulo">Só o administrador</p>
      <h2 className="mt-1 text-lg font-bold">Avisar os clientes</h2>
      <p className="ajuda">
        Quem já era cliente não tem como saber o código: ele só sai impresso em contrato novo. O primeiro aviso conta a novidade e entrega o código de
        cada um, pelo contato do cadastro. Depois, um lembrete por semana repete as regras, <strong>sem o código</strong>, até completar {totalDeAvisos}{" "}
        avisos.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="indicador">
          <p className="indicador-numero">{p.naoAvisados + p.semCodigo}</p>
          <p className="indicador-rotulo">Ainda não avisados</p>
        </div>
        <div className="indicador">
          <p className="indicador-numero">{p.emCampanha}</p>
          <p className="indicador-rotulo">Recebendo os lembretes</p>
        </div>
        <div className="indicador">
          <p className="indicador-numero">{p.concluiram}</p>
          <p className="indicador-rotulo">Campanha concluída</p>
        </div>
        <div className="indicador">
          <p className="indicador-numero">{p.comCodigo + p.semCodigo}</p>
          <p className="indicador-rotulo">Clientes no cadastro</p>
        </div>
      </div>

      <ul className="mt-4 grid gap-1 text-sm">
        <li className={p.canais.email ? "text-emerald-700" : "text-amber-800"}>E-mail: {p.canais.email ? "pronto, pelo e-mail do escritório." : p.canais.semEmail}</li>
        <li className={p.canais.whatsapp ? "text-emerald-700" : "text-amber-800"}>WhatsApp: {p.canais.whatsapp ? "pronto." : p.canais.semWhatsapp}</li>
        {!p.temTelefone ? <li className="text-red-700">Preencha o telefone de atendimento do escritório em Configurações antes de avisar.</li> : null}
      </ul>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          Para confirmar, digite ENVIAR
          <input className="campo w-40" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} disabled={rodando} autoComplete="off" />
        </label>
        <button type="button" className="botao-principal" disabled={!pronto || rodando} onClick={() => disparar(false)}>
          {rodando ? "Enviando…" : "Enviar o 1º aviso a quem falta"}
        </button>
        {p.canais.email && p.canais.whatsapp ? (
          <button type="button" className="botao-discreto" disabled={!pronto || rodando} onClick={() => disparar(true)}>
            Enviar só os e-mails
          </button>
        ) : null}
      </div>
      <p className="ajuda">
        Ninguém recebe duas vezes pelo mesmo canal: repetir só tenta o que faltou. Antes do disparo geral, teste em um cliente pela lista acima
        (“enviar o 1º aviso só a este”) — o seu próprio cadastro, por exemplo.
      </p>
      {andamento ? (
        <p role="status" className="mt-2 text-sm font-medium text-slate-800">
          {andamento}
        </p>
      ) : null}
      {erro ? <p className="aviso-erro mt-2">{erro}</p> : null}
      {falhas.length ? (
        <ul className="mt-2 grid gap-0.5 text-sm text-red-700">
          {falhas.map((f, i) => (
            <li key={`${f}-${i}`}>{f}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-8 border-t border-slate-200 pt-5">
        <h3 className="font-semibold">O código à vista dentro do WhatsApp</h3>
        <p className="ajuda">
          Para quem atende direto no WhatsApp do celular: este arquivo de contatos põe o código no nome de cada cliente (“MARIA SANTOS — GIRASSOL 27”),
          e ele aparece no topo da conversa. Importe no celular do escritório.
        </p>
        <p className="aviso-atencao mt-2 text-sm">
          É a lista de todos os códigos numa mão só. Só importe em celular do escritório, com senha na tela: celular perdido entrega o código de todos de
          uma vez. Comece pelo teste de 3 contatos — importar contato que já existe na agenda costuma criar entrada repetida.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a className="botao-secundario text-sm" href="/api/codigos/contatos?quais=teste&nome=curto">
            Baixar teste (3 contatos)
          </a>
          <a className="botao-secundario text-sm" href="/api/codigos/contatos?nome=curto">
            Todos, nome curto (recomendado)
          </a>
          <a className="botao-secundario text-sm" href="/api/codigos/contatos?nome=completo">
            Todos, nome completo
          </a>
        </div>
        <p className="ajuda">Nome curto é o primeiro e o último nome: o WhatsApp corta o fim do nome no topo da conversa, que é onde está o código.</p>
      </div>
    </section>
  );
}
