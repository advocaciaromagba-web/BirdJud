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
}: {
  texto: string;
  onTexto: (novo: string) => void;
}) {
  const [disponibilidade, setDisponibilidade] =
    useState<Disponibilidade>("verificando");
  const [instalando, setInstalando] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [lado, setLado] = useState<Lado>("CLIENTE");
  const [parcial, setParcial] = useState("");
  const [semFalaHa, setSemFalaHa] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

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
      setErro("Nao deu para baixar o portugues agora. Tente de novo.");
    } finally {
      setInstalando(false);
    }
  }

  function comecar() {
    const F = fabrica();
    if (!F || disponibilidade !== "pronto") return;
    setErro(null);
    querParar.current = false;

    const r = new F();
    r.lang = IDIOMA;
    r.continuous = true;
    r.interimResults = true;
    // A trava que importa: se o navegador respeitar, o audio nao sai daqui.
    r.processLocally = true;

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
    } catch {
      setErro("Nao deu para comecar a ouvir. Confira o microfone.");
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
            {instalando ? "Baixando o portugues..." : "Baixar o portugues"}
          </button>
        </div>
      ) : null}

      {disponibilidade === "pronto" ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={ouvindo ? parar : comecar}
            className={ouvindo ? "botao-secundario text-xs" : "botao-primario text-xs"}
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
          esta selecionado — e o jeito mais comum de perder uma entrevista
          inteira.
        </p>
      ) : null}
    </div>
  );
}
