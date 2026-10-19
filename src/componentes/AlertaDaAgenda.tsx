"use client";

// O alerta da agenda na tela de quem esta marcado: 1 hora e 15 minutos antes
// (regras em src/lib/alerta-da-agenda.ts). Fica em toda tela de dentro do
// sistema, pela Estrutura.
//
// O som e gerado aqui (Web Audio), sem arquivo de audio para baixar. O
// navegador so deixa tocar depois que a pessoa mexeu na pagina uma vez — por
// isso o primeiro clique ou tecla "destrava" o som. Se ainda assim nao tocar,
// o aviso na tela aparece do mesmo jeito.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  alertasDevidos,
  textoDoQuantoFalta,
  type AlertaDevido,
  type ProximoCompromisso,
} from "@/lib/alerta-da-agenda";

const BUSCAR_A_CADA_MS = 5 * 60_000;
const CONFERIR_A_CADA_MS = 20_000;
const GUARDA = "birdjud:alertas-tocados";
/** Evento para a tela Minha conta e o aviso concordarem sobre o som. */
export const EVENTO_DO_SOM = "birdjud:alerta-sonoro";

let contexto: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Classe =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Classe) return null;
  contexto ??= new Classe();
  return contexto;
}

/** Tres toques de duas notas, uns 3 segundos ao todo. */
export async function tocarAlerta(): Promise<boolean> {
  const ctx = audio();
  if (!ctx) return false;
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  if (ctx.state !== "running") return false;
  const inicio = ctx.currentTime + 0.05;
  for (let i = 0; i < 3; i++) {
    for (const [j, freq] of [880, 660].entries()) {
      const t = inicio + i * 1 + j * 0.22;
      const osc = ctx.createOscillator();
      const ganho = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      ganho.gain.setValueAtTime(0.0001, t);
      ganho.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      ganho.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.connect(ganho).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.22);
    }
  }
  return true;
}

function lerTocados(): Map<string, number> {
  try {
    const bruto = JSON.parse(window.localStorage.getItem(GUARDA) ?? "{}") as Record<string, number>;
    const umDia = Date.now() - 24 * 60 * 60_000;
    return new Map(Object.entries(bruto).filter(([, quando]) => quando > umDia));
  } catch {
    return new Map();
  }
}

function guardarTocados(tocados: Map<string, number>) {
  try {
    window.localStorage.setItem(GUARDA, JSON.stringify(Object.fromEntries(tocados)));
  } catch {
    // Sem armazenamento (janela anonima): o alerta pode repetir ao recarregar.
  }
}

const hora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

const ROTULO: Record<string, string> = {
  AUDIENCIA: "Audiencia",
  PERICIA: "Pericia",
  COMPROMISSO: "Atendimento",
};

export function AlertaDaAgenda() {
  const [compromissos, setCompromissos] = useState<ProximoCompromisso[]>([]);
  const [som, setSom] = useState(true);
  const [abertos, setAbertos] = useState<AlertaDevido[]>([]);
  const somRef = useRef(som);
  somRef.current = som;
  // Na memoria tambem: sem localStorage, nao repetir a cada 20 s.
  const tocadosRef = useRef<Map<string, number> | null>(null);

  const buscar = useCallback(async () => {
    try {
      const r = await fetch("/api/agenda/alertas", { cache: "no-store" });
      if (!r.ok) return;
      const dados = (await r.json()) as { alertaSonoro: boolean; compromissos: ProximoCompromisso[] };
      setSom(dados.alertaSonoro);
      setCompromissos(dados.compromissos);
    } catch {
      // Sem rede: fica o que ja se sabia; o relogio continua conferindo.
    }
  }, []);

  useEffect(() => {
    void buscar();
    const busca = window.setInterval(buscar, BUSCAR_A_CADA_MS);
    const aoVoltar = () => document.visibilityState === "visible" && void buscar();
    document.addEventListener("visibilitychange", aoVoltar);
    // Destrava o som no primeiro gesto da pessoa (regra dos navegadores).
    const destravar = () => void audio()?.resume().catch(() => {});
    window.addEventListener("pointerdown", destravar, { once: true });
    window.addEventListener("keydown", destravar, { once: true });
    const aoMudarSom = (e: Event) => setSom((e as CustomEvent<boolean>).detail);
    window.addEventListener(EVENTO_DO_SOM, aoMudarSom);
    return () => {
      window.clearInterval(busca);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("pointerdown", destravar);
      window.removeEventListener("keydown", destravar);
      window.removeEventListener(EVENTO_DO_SOM, aoMudarSom);
    };
  }, [buscar]);

  useEffect(() => {
    const conferir = () => {
      // Le de novo a cada vez: outra aba aberta pode ter tocado este alerta.
      // Aviso de compromisso que ja comecou ha meia hora sai sozinho.
      const limite = Date.now() - 30 * 60_000;
      setAbertos((atuais) =>
        atuais.some((a) => Date.parse(a.compromisso.inicio) < limite)
          ? atuais.filter((a) => Date.parse(a.compromisso.inicio) >= limite)
          : atuais,
      );
      const tocados = lerTocados();
      for (const [chave, quando] of tocadosRef.current ?? []) tocados.set(chave, quando);
      const devidos = alertasDevidos(compromissos, Date.now(), new Set(tocados.keys()));
      if (!devidos.length) return;
      for (const d of devidos) tocados.set(d.chave, Date.now());
      tocadosRef.current = tocados;
      guardarTocados(tocados);
      setAbertos((atuais) => [
        ...atuais.filter((a) => !devidos.some((d) => d.compromisso.id === a.compromisso.id)),
        ...devidos,
      ]);
      if (somRef.current) void tocarAlerta();
    };
    conferir();
    const relogio = window.setInterval(conferir, CONFERIR_A_CADA_MS);
    return () => window.clearInterval(relogio);
  }, [compromissos]);

  async function trocarSom() {
    const novo = !som;
    setSom(novo);
    window.dispatchEvent(new CustomEvent(EVENTO_DO_SOM, { detail: novo }));
    await fetch("/api/agenda/alertas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertaSonoro: novo }),
    }).catch(() => {});
  }

  if (!abertos.length) return null;
  return (
    <div className="fixed inset-x-4 bottom-4 z-50 grid gap-3 sm:left-auto sm:w-96" aria-live="assertive">
      {abertos.map((a) => {
        const c = a.compromisso;
        return (
          <div key={a.chave} role="alert" data-alerta-da-agenda="" className="cartao-aperto border-l-4 text-left shadow-lg" style={{ borderLeftColor: "var(--marca-primaria)" }}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {ROTULO[c.tipo] ?? "Compromisso"} as {hora(c.inicio)}
            </p>
            <p className="mt-1 font-semibold text-slate-900">{textoDoQuantoFalta(a.faltamMinutos)}</p>
            <p className="mt-1 text-sm text-slate-700">{c.titulo}</p>
            {c.local ? <p className="mt-1 text-sm text-slate-600">{c.local}</p> : null}
            {c.link ? (
              <a href={c.link} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-sm underline">
                Entrar na sala virtual
              </a>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="botao-principal"
                onClick={() => setAbertos((atuais) => atuais.filter((x) => x.chave !== a.chave))}
              >
                Ok
              </button>
              <a href="/agenda" className="botao-secundario">
                Ver agenda
              </a>
              <button type="button" className="botao-discreto" onClick={trocarSom} aria-pressed={som}>
                {som ? "Desligar som" : "Ligar som"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
