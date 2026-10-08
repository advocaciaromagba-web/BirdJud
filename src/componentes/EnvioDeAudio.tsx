"use client";

import { useRef, useState } from "react";
import {
  FORMATOS_ACEITOS,
  LIMITE_DE_BYTES,
} from "@/lib/transcricao-audio";

/**
 * Audio gravado virando texto.
 *
 * Isto e para audiencia e reuniao JA GRAVADAS. Para a conversa que esta
 * acontecendo agora, o gravador local acima e melhor — ele nao manda nada
 * para fora.
 *
 * O AVISO DE SIGILO E PARTE DO RECURSO, nao enfeite. O audio sai do
 * escritorio para a OpenAI virar texto. Quem clica precisa saber disso
 * ANTES, e nao descobrir depois numa pagina de documentacao.
 */
export function EnvioDeAudio({
  entrevistaId,
  onTranscrito,
  onErro,
}: {
  entrevistaId: string;
  onTranscrito: () => void;
  onErro: (mensagem: string | null) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  async function enviar(arquivo: File) {
    onErro(null);
    setEnviando(true);
    try {
      const corpo = new FormData();
      corpo.append("audio", arquivo);
      const r = await fetch(`/api/entrevistas/${entrevistaId}/audio`, {
        method: "POST",
        body: corpo,
      });
      if (!r.ok) {
        const dados = await r.json().catch(() => ({}));
        throw new Error(dados.erro ?? "Nao deu para transcrever o audio.");
      }
      onTranscrito();
    } catch (falha) {
      onErro((falha as Error).message);
    } finally {
      setEnviando(false);
      if (campo.current) campo.current.value = "";
    }
  }

  return (
    <div className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs text-amber-900">
        <strong>Audio gravado vira texto fora do escritorio.</strong> O
        arquivo e enviado ao servico de transcricao da OpenAI, contratado
        pela plataforma. E a mesma natureza de exposicao de quando o texto
        vai para a IA ser organizado — mas e o audio, com a voz de quem
        falou. Para a conversa ao vivo, prefira a transcricao acima, que roda
        no proprio computador.
      </p>

      {!confirmado ? (
        <label className="flex items-start gap-2 text-xs text-amber-900">
          <input
            type="checkbox"
            checked={confirmado}
            onChange={(ev) => setConfirmado(ev.target.checked)}
            className="mt-0.5"
          />
          <span>Entendi, e quero enviar o audio para transcricao.</span>
        </label>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={campo}
            type="file"
            accept={FORMATOS_ACEITOS.join(",")}
            disabled={enviando}
            onChange={(ev) => {
              const arquivo = ev.target.files?.[0];
              if (arquivo) void enviar(arquivo);
            }}
            className="text-xs"
          />
          <span className="text-xs text-amber-800">
            {enviando
              ? "Transcrevendo... audio longo leva alguns minutos."
              : `Ate ${LIMITE_DE_BYTES / 1024 / 1024} MB. O texto e ACRESCENTADO ao que ja esta anotado.`}
          </span>
        </div>
      )}
    </div>
  );
}
