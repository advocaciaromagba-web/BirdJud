"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AVISO_DA_DISPONIBILIDADE,
  LADOS,
  SEGUNDOS_ATE_AVISAR_SILENCIO,
  juntarFala,
  type Disponibilidade,
  type Lado,
} from "@/lib/transcricao";

/**
 * Transcricao ao vivo da entrevista, no proprio computador.
 *
 * LOCAL OU NADA. Por padrao o reconhecimento do Chrome manda o audio para um
 * servidor; o modo no dispositivo existe desde o Chrome 139 mas precisa do
 * idioma instalado. Numa triagem o que se fala e sigilo profissional, entao
 * este componente NUNCA liga o modo nuvem sozinho — sem local disponivel ele
 * explica o que a nuvem significa e para por ai. Quem decide mandar a
 * conversa do cliente para fora e a pessoa na sala.
 *
 * O erro mais caro aqui nao e transcrever mal: e o microfone errado e vinte
 * minutos de conversa que nao viraram nada. Por isso o aviso de silencio.
 */

type Reconhecedor = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((evento: unknown) => void) | null;
  onerror: ((evento: unknown) => void) | null;
  onend: (() => void) | null;
};

type FabricaDeReconhecimento = {
  new (): Reconhecedor;
  available?: (opcoes: {
    langs: string[];
    processLocally: boolean;
  }) => Promise<string>;
  install?: (opcoes: { langs: string[] }) => Promise<boolean>;
  installOnDevice?: (opcoes: { langs: string[] }) => Promise<boolean>;
};

const IDIOMA = "pt-BR";

function fabrica(): FabricaDeReconhecimento | null {
  if (typeof window === "undefined") return null;
  const janela = window as unknown as Record<string, unknown>;
  return ((janela.SpeechRecognition ??
    janela.webkitSpeechRecognition) as FabricaDeReconhecimento) ?? null;
}

export function GravadorDeFala({
  texto,
  onTexto,
  onOrigem,
}: {
  texto: string;
  onTexto: (novo: string) => void;
  /** LOCAL (no computador) ou NUVEM (com autorizacao): vai para o PDF. */
  onOrigem?: (origem: "LOCAL" | "NUVEM") => void;
}) {
  const [disponibilidade, setDisponibilidade] =
    useState<Disponibilidade>("verificando");
  const [instalando, setInstalando] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [lado, setLado] = useState<Lado>("CLIENTE");
  const [parcial, setParcial] = useState("");
  const [semFalaHa, setSemFalaHa] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  // Nuvem so com autorizacao expressa, nesta entrevista (metodo da Roma):
  // para muitos atendimentos e aceitavel; para conversa sensivel, talvez nao.
  const [aceitouNuvem, setAceitouNuvem] = useState(false);
  // Teste de microfone: separa "microfone nao capta" de "reconhecimento nao
  // entende" — sem isso a pessoa so ve "ouvindo" e nada acontecendo.
  const [testandoMic, setTestandoMic] = useState(false);
  const [nivel, setNivel] = useState(0);
  const [jaCaptou, setJaCaptou] = useState(false);
  const [microfones, setMicrofones] = useState<string[]>([]);
  const fluxoRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const animacaoRef = useRef<number | null>(null);

  const reconhecedor = useRef<Reconhecedor | null>(null);
  const ladoAtual = useRef<Lado>(lado);
  const ultimoLado = useRef<Lado | null>(null);
  const textoAtual = useRef(texto);
  const querParar = useRef(false);
  ladoAtual.current = lado;
  textoAtual.current = texto;

  const conferir = useCallback(async () => {
    const F = fabrica();
    if (!F || typeof F.available !== "function") {
      // Sem a conferencia de disponibilidade nao da para saber se o audio
      // ficaria no computador. Na duvida, nao transcreve.
      setDisponibilidade("sem-suporte");
      return;
    }
    try {
      const estado = await F.available({
        langs: [IDIOMA],
        processLocally: true,
      });
      setDisponibilidade(
        estado === "available"
          ? "pronto"
          : estado === "unavailable"
            ? "sem-suporte"
            : "precisa-instalar",
      );
    } catch {
      setDisponibilidade("sem-suporte");
    }
  }, []);

  useEffect(() => {
    void conferir();
  }, [conferir]);

  // Conta quanto tempo faz que nada e ouvido, para avisar do microfone.
  useEffect(() => {
    if (!ouvindo) {
      setSemFalaHa(0);
      return;
    }
    const relogio = setInterval(() => setSemFalaHa((s) => s + 1), 1000);
    return () => clearInterval(relogio);
  }, [ouvindo]);

  async function instalar() {
    const F = fabrica();
    const instalador = F?.install ?? F?.installOnDevice;
    if (!F || typeof instalador !== "function") {
      setDisponibilidade("sem-suporte");
      return;
    }
    setInstalando(true);
    setErro(null);
    try {
      await instalador.call(F, { langs: [IDIOMA] });
      await conferir();
    } catch {
      setErro("Não deu para baixar o português agora. Tente de novo.");
    } finally {
      setInstalando(false);
    }
  }

  async function testarMicrofone() {
    setErro(null);
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
      fluxoRef.current = fluxo;
      const Contexto =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const contexto = new Contexto();
      audioRef.current = contexto;
      const analisador = contexto.createAnalyser();
      analisador.fftSize = 512;
      contexto.createMediaStreamSource(fluxo).connect(analisador);
      const amostras = new Uint8Array(analisador.frequencyBinCount);
      setTestandoMic(true);
      const medir = () => {
        analisador.getByteTimeDomainData(amostras);
        // Distancia media do silencio (128 e o ponto neutro).
        let soma = 0;
        for (const v of amostras) soma += Math.abs(v - 128);
        const n = Math.min(100, Math.round((soma / amostras.length) * 6));
        setNivel(n);
        if (n > 8) setJaCaptou(true);
        animacaoRef.current = requestAnimationFrame(medir);
      };
      medir();
      const lista = await navigator.mediaDevices.enumerateDevices();
      setMicrofones(lista.filter((d) => d.kind === "audioinput").map((d) => d.label || "microfone sem nome"));
    } catch (e) {
      setTestandoMic(false);
      const nome = (e as { name?: string })?.name;
      setErro(
        nome === "NotAllowedError"
          ? "O navegador bloqueou o microfone. Clique no cadeado ao lado do endereço e autorize o microfone."
          : nome === "NotFoundError"
            ? "Nenhum microfone foi encontrado neste computador."
            : `Não foi possível acessar o microfone (${nome ?? "erro desconhecido"}).`,
      );
    }
  }

  function pararTeste() {
    if (animacaoRef.current) cancelAnimationFrame(animacaoRef.current);
    fluxoRef.current?.getTracks().forEach((t) => t.stop());
    audioRef.current?.close().catch(() => {});
    fluxoRef.current = null;
    audioRef.current = null;
    setTestandoMic(false);
    setNivel(0);
  }

  useEffect(() => () => pararTeste(), []);

  const podeNuvem = disponibilidade === "sem-suporte" && fabrica() !== null;
  const podeGravar = disponibilidade === "pronto" || (podeNuvem && aceitouNuvem);

  function comecar() {
    const F = fabrica();
    if (!F || !podeGravar) return;
    const local = disponibilidade === "pronto";
    setErro(null);
    querParar.current = false;

    const r = new F();
    r.lang = IDIOMA;
    r.continuous = true;
    r.interimResults = true;
    // A trava que importa: se o navegador respeitar, o audio nao sai daqui.
    // Sem modo local, so com a autorizacao marcada acima.
    if (local) r.processLocally = true;

    r.onresult = (evento) => {
      const e = evento as {
        resultIndex: number;
        results: ArrayLike<
          ArrayLike<{ transcript: string }> & { isFinal: boolean }
        >;
      };
      let emAndamento = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const resultado = e.results[i];
        const trecho = resultado[0]?.transcript ?? "";
        if (resultado.isFinal) {
          setSemFalaHa(0);
          const novo = juntarFala(
            textoAtual.current,
            trecho,
            ladoAtual.current,
            ultimoLado.current,
          );
          if (novo !== textoAtual.current) {
            ultimoLado.current = ladoAtual.current;
            textoAtual.current = novo;
            onTexto(novo);
          }
        } else {
          emAndamento += trecho;
          setSemFalaHa(0);
        }
      }
      setParcial(emAndamento);
    };

    r.onerror = (evento) => {
      const nome = (evento as { error?: string }).error ?? "";
      if (nome === "not-allowed") {
        setErro("O navegador bloqueou o microfone. Libere e comece de novo.");
        querParar.current = true;
      } else if (nome === "no-speech") {
        // Normal numa pausa longa; o onend reinicia.
        return;
      } else if (nome) {
        setErro(`O reconhecimento parou: ${nome}.`);
      }
    };

    // continuous nao basta: o navegador encerra sozinho depois de um tempo.
    // Sem religar, a entrevista para de ser transcrita sem ninguem notar.
    r.onend = () => {
      if (querParar.current) {
        setOuvindo(false);
        setParcial("");
        return;
      }
      try {
        r.start();
      } catch {
        setOuvindo(false);
      }
    };

    reconhecedor.current = r;
    try {
      r.start();
      setOuvindo(true);
      onOrigem?.(local ? "LOCAL" : "NUVEM");
    } catch {
      setErro("Não deu para começar a ouvir. Confira o microfone.");
    }
  }

  function parar() {
    querParar.current = true;
    reconhecedor.current?.stop();
    setOuvindo(false);
    setParcial("");
  }

  useEffect(() => {
    return () => {
      querParar.current = true;
      reconhecedor.current?.stop();
    };
  }, []);

  return (
    <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs text-slate-600">
        {AVISO_DA_DISPONIBILIDADE[disponibilidade]}
      </p>

      {erro ? <p className="text-xs text-red-700">{erro}</p> : null}

      {disponibilidade === "precisa-instalar" ? (
        <div>
          <button
            type="button"
            onClick={instalar}
            disabled={instalando}
            className="botao-secundario text-xs"
          >
            {instalando ? "Baixando o português..." : "Baixar o português"}
          </button>
        </div>
      ) : null}

      {podeNuvem && !aceitouNuvem ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-semibold">Atenção ao sigilo profissional</p>
          <p className="mt-1">
            Este navegador não transcreve sem ajuda externa. Se você ativar, o áudio da conversa vai para o serviço de
            reconhecimento de voz do navegador para virar texto. Para muitos atendimentos isso e aceitavel; para
            conversas sensíveis, talvez não. A alternativa sem envio nenhum é digitar no campo abaixo.
          </p>
          <label className="mt-2 flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={aceitouNuvem} onChange={(e) => setAceitouNuvem(e.target.checked)} />
            <span>Estou ciente e autorizo a transcrição por serviço externo nesta entrevista.</span>
          </label>
        </div>
      ) : null}

      {/* Medidor de microfone */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={testandoMic ? pararTeste : testarMicrofone} className="botao-secundario text-xs">
          {testandoMic ? "Parar teste" : "Testar microfone"}
        </button>
        {testandoMic ? (
          <>
            <div className="h-2.5 min-w-[8rem] flex-1 overflow-hidden rounded-full bg-slate-200" aria-label="Nível do microfone">
              <div className={`h-full ${nivel > 8 ? "bg-emerald-500" : "bg-slate-400"}`} style={{ width: `${nivel}%` }} />
            </div>
            <span className="text-xs text-slate-500">{nivel > 8 ? "captando" : "silencio"}</span>
          </>
        ) : null}
      </div>
      {testandoMic ? (
        <p className="text-xs text-slate-500">
          Fale agora. Se a barra não se mexer, o problema é o microfone ou a permissão do navegador — não o
          reconhecimento.{jaCaptou ? " O microfone está funcionando." : ""}
          {microfones.length ? ` Microfones: ${microfones.join(" · ")}.` : ""}
        </p>
      ) : null}

      {podeGravar ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={ouvindo ? parar : comecar}
            className={ouvindo ? "botao-secundario text-xs" : "botao-principal text-xs"}
          >
            {ouvindo ? "Parar de ouvir" : "Transcrever a conversa"}
          </button>

          {ouvindo ? (
            <>
              <span className="text-xs text-slate-600">Quem fala agora:</span>
              <div className="flex gap-1">
                {LADOS.map((qual) => (
                  <button
                    key={qual}
                    type="button"
                    onClick={() => setLado(qual)}
                    className={`rounded-full px-3 py-1 text-xs ${
                      lado === qual
                        ? "bg-slate-900 text-white"
                        : "bg-white text-slate-700 ring-1 ring-slate-300"
                    }`}
                  >
                    {qual === "ADVOGADO" ? "Advogado" : "Cliente"}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {ouvindo && parcial ? (
        <p className="text-sm italic text-slate-500">{parcial}</p>
      ) : null}

      {ouvindo && semFalaHa >= SEGUNDOS_ATE_AVISAR_SILENCIO ? (
        <p className="text-xs text-amber-800">
          Faz {semFalaHa}s que nada e ouvido. Confira se o microfone certo
          está selecionado — é o jeito mais comum de perder uma entrevista
          inteira.
        </p>
      ) : null}
    </div>
  );
}
