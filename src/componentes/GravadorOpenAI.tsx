"use client";

import { useEffect, useRef, useState } from "react";

/** Cada trecho que vai para a transcricao. Um minuto: o texto aparece rapido e o arquivo fica pequeno. */
const TRECHO_MS = 60_000;
/** Abaixo disso o trecho e so o clique de parar: nao vale uma chamada. */
const MINIMO_BYTES = 2 * 1024;

function formatoDoNavegador(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const tipo of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(tipo)) return tipo;
  }
  return undefined;
}

function relogio(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Grava a conversa no proprio sistema e transcreve pela OpenAI, na hora.
 *
 * O metodo do sistema da Advocacia Roma (audio -> OpenAI -> texto), sem
 * precisar gravar no celular e importar depois: o microfone grava em trechos
 * de um minuto, cada trecho vai para a transcricao assim que fecha, e o texto
 * entra na entrevista enquanto a conversa continua. Parar manda o ultimo.
 *
 * Os trechos vao EM ORDEM, um de cada vez — dois ao mesmo tempo poderiam
 * chegar trocados e embaralhar a conversa.
 *
 * O audio nao fica guardado: so o texto. O aviso de sigilo vem antes do
 * primeiro clique, igual ao envio de arquivo.
 */
export function GravadorOpenAI({
  entrevistaId,
  podeGravar,
  motivoBloqueio,
  onTexto,
  onGravando,
  onErro,
}: {
  entrevistaId: string;
  /** false quando ha texto digitado sem salvar: a gravacao escreveria por cima. */
  podeGravar: boolean;
  motivoBloqueio?: string | null;
  onTexto: (texto: string) => void;
  onGravando: (gravando: boolean) => void;
  onErro: (mensagem: string | null) => void;
}) {
  const [ciente, setCiente] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [nivel, setNivel] = useState(0);
  const [enviados, setEnviados] = useState(0);
  const [naFila, setNaFila] = useState(0);

  const fluxo = useRef<MediaStream | null>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const corte = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relogioRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const animacao = useRef<number | null>(null);
  const continuar = useRef(false);
  const fila = useRef<Promise<void>>(Promise.resolve());
  const numero = useRef(0);

  function enfileirar(blob: Blob, tipo: string) {
    if (blob.size < MINIMO_BYTES) return;
    numero.current += 1;
    const n = numero.current;
    setNaFila((q) => q + 1);
    fila.current = fila.current.then(async () => {
      try {
        const extensao = tipo.includes("mp4") ? "m4a" : tipo.includes("ogg") ? "ogg" : "webm";
        const corpo = new FormData();
        corpo.append("audio", new File([blob], `trecho-${n}.${extensao}`, { type: tipo.split(";")[0] }));
        corpo.append("continua", "true");
        const r = await fetch(`/api/entrevistas/${entrevistaId}/audio`, { method: "POST", body: corpo });
        const dados = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(dados.erro ?? "Nao deu para transcrever um trecho.");
        onTexto(dados.texto ?? "");
        setEnviados((e) => e + 1);
      } catch (falha) {
        onErro(`Trecho ${n}: ${(falha as Error).message}`);
      } finally {
        setNaFila((q) => q - 1);
      }
    });
  }

  function abrirTrecho(tipo: string) {
    if (!fluxo.current) return;
    const pedacos: Blob[] = [];
    const g = new MediaRecorder(fluxo.current, { mimeType: tipo });
    g.ondataavailable = (ev) => {
      if (ev.data.size > 0) pedacos.push(ev.data);
    };
    g.onstop = () => {
      enfileirar(new Blob(pedacos, { type: tipo }), tipo);
      // Cada trecho e um arquivo completo (com cabecalho): por isso se para e
      // se abre outro gravador, em vez de fatiar um so.
      if (continuar.current) abrirTrecho(tipo);
      else {
        desligarMicrofone();
        terminarDepoisDaFila();
      }
    };
    gravador.current = g;
    g.start();
    corte.current = setTimeout(() => {
      if (g.state === "recording") g.stop();
    }, TRECHO_MS);
  }

  function medir(stream: MediaStream) {
    const Contexto = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Contexto();
    audio.current = ctx;
    const analisador = ctx.createAnalyser();
    analisador.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analisador);
    const amostras = new Uint8Array(analisador.frequencyBinCount);
    const passo = () => {
      analisador.getByteTimeDomainData(amostras);
      let soma = 0;
      for (const v of amostras) soma += Math.abs(v - 128);
      setNivel(Math.min(100, Math.round((soma / amostras.length) * 6)));
      animacao.current = requestAnimationFrame(passo);
    };
    passo();
  }

  /** Avisa que acabou so depois que o ultimo trecho voltou: e ai que o texto esta inteiro. */
  function terminarDepoisDaFila() {
    fila.current = fila.current.then(() => onGravando(false));
  }

  function desligarMicrofone() {
    if (animacao.current) cancelAnimationFrame(animacao.current);
    audio.current?.close().catch(() => {});
    fluxo.current?.getTracks().forEach((t) => t.stop());
    fluxo.current = null;
    audio.current = null;
    setNivel(0);
  }

  async function iniciar() {
    onErro(null);
    const tipo = formatoDoNavegador();
    if (!tipo || !navigator.mediaDevices?.getUserMedia) {
      onErro("Este navegador nao grava audio. Use o Chrome, o Edge ou o Safari atualizados, ou importe o audio gravado no celular.");
      return;
    }
    try {
      fluxo.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const nome = (e as { name?: string }).name;
      onErro(
        nome === "NotAllowedError"
          ? "O navegador bloqueou o microfone. Clique no cadeado ao lado do endereco do site e autorize o microfone."
          : nome === "NotFoundError"
            ? "Nenhum microfone foi encontrado neste computador."
            : "Nao foi possivel acessar o microfone.",
      );
      return;
    }
    continuar.current = true;
    setSegundos(0);
    setEnviados(0);
    numero.current = 0;
    setGravando(true);
    onGravando(true);
    medir(fluxo.current);
    relogioRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
    abrirTrecho(tipo);
  }

  function parar() {
    continuar.current = false;
    if (corte.current) clearTimeout(corte.current);
    if (relogioRef.current) clearInterval(relogioRef.current);
    setGravando(false);
    // O onstop do gravador manda o ultimo trecho e chama terminarDepoisDaFila.
    if (gravador.current?.state === "recording") gravador.current.stop();
    else {
      desligarMicrofone();
      terminarDepoisDaFila();
    }
  }

  useEffect(
    () => () => {
      continuar.current = false;
      if (corte.current) clearTimeout(corte.current);
      if (relogioRef.current) clearInterval(relogioRef.current);
      if (gravador.current?.state === "recording") gravador.current.stop();
      desligarMicrofone();
    },
    [],
  );

  return (
    <div className="grid gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3">
      <p className="text-sm font-semibold text-sky-950">Gravar a conversa e transcrever na hora</p>
      <p className="text-xs text-sky-900">
        O sistema grava pelo microfone e manda cada minuto para a transcricao da OpenAI: o texto vai aparecendo
        abaixo enquanto a conversa acontece. O audio nao fica guardado, so o texto. Grave so com a ciencia do
        cliente — o audio sai do escritorio para virar texto.
      </p>

      {!ciente ? (
        <label className="flex items-start gap-2 text-xs text-sky-950">
          <input type="checkbox" checked={ciente} onChange={(ev) => setCiente(ev.target.checked)} className="mt-0.5" />
          <span>O cliente esta ciente da gravacao, e autorizo enviar o audio para transcricao.</span>
        </label>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {!gravando ? (
            <button
              type="button"
              onClick={iniciar}
              disabled={!podeGravar || naFila > 0}
              className="botao-principal text-xs disabled:opacity-50"
            >
              {naFila > 0 ? "Terminando de transcrever..." : "Gravar e transcrever"}
            </button>
          ) : (
            <button type="button" onClick={parar} className="botao-secundario text-xs">
              Parar gravacao
            </button>
          )}
          {gravando ? (
            <span className="flex items-center gap-2 text-xs text-sky-950" aria-live="polite">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" aria-hidden />
              Gravando {relogio(segundos)}
              <span className="h-2 w-24 overflow-hidden rounded-full bg-sky-100" aria-hidden>
                <span
                  className={`block h-full ${nivel > 8 ? "bg-emerald-500" : "bg-slate-300"}`}
                  style={{ width: `${nivel}%` }}
                />
              </span>
              {nivel > 8 ? "captando" : "silencio"}
            </span>
          ) : null}
          {(gravando || naFila > 0 || enviados > 0) && (
            <span className="text-xs text-sky-900" aria-live="polite">
              {enviados} trecho(s) transcrito(s){naFila > 0 ? `, ${naFila} transcrevendo` : ""}.
            </span>
          )}
        </div>
      )}
      {!podeGravar && motivoBloqueio ? <p className="text-xs text-amber-800">{motivoBloqueio}</p> : null}
    </div>
  );
}
