"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Campo = {
  nome: string;
  rotulo: string;
  tipo?:
    | "text"
    | "email"
    | "password"
    | "date"
    | "datetime-local"
    | "select"
    | "textarea";
  obrigatorio?: boolean;
  opcoes?: { valor: string; rotulo: string }[];
  ajuda?: string;
  /** Ocupa a linha inteira na grade de dois campos. */
  largo?: boolean;
};

/**
 * Formulario de criacao usado por clientes, processos, agenda e usuarios.
 *
 * Um so lugar para o tratamento de erro da API e para o recarregamento da
 * lista depois de gravar.
 *
 * Os campos sao controlados de proposito: e assim que a leitura de documento
 * consegue preencher a tela sem que a pessoa redigite. `leitor` recebe uma
 * funcao que preenche, e devolve o que quiser desenhar acima do formulario.
 */
export function FormularioCriar({
  rota,
  campos,
  textoBotao = "Adicionar",
  recolhivel = false,
  textoAbrir,
  leitor,
}: {
  rota: string;
  campos: Campo[];
  textoBotao?: string;
  /** Guardado atras de um botao: a lista e que importa na tela, nao o formulario. */
  recolhivel?: boolean;
  textoAbrir?: string;
  leitor?: (
    preencher: (valores: Record<string, string>) => void,
  ) => React.ReactNode;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aberto, setAberto] = useState(!recolhivel);
  const [valores, setValores] = useState<Record<string, string>>({});

  function mudar(nome: string, valor: string) {
    setValores((atuais) => ({ ...atuais, [nome]: valor }));
  }

  function preencher(novos: Record<string, string>) {
    const conhecidos = new Set(campos.map((campo) => campo.nome));
    setValores((atuais) => {
      const juntos = { ...atuais };
      for (const [nome, valor] of Object.entries(novos)) {
        if (conhecidos.has(nome) && valor) juntos[nome] = valor;
      }
      return juntos;
    });
  }

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);

    const corpo: Record<string, string> = {};
    for (const campo of campos) {
      const valor = (valores[campo.nome] ?? "").trim();
      if (valor) corpo[campo.nome] = valor;
    }

    const resposta = await fetch(rota, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    setEnviando(false);

    if (resposta.ok) {
      setValores({});
      if (recolhivel) setAberto(false);
      router.refresh();
      return;
    }
    const json = await resposta.json().catch(() => ({}));
    setErro(json.erro ?? "Nao foi possivel gravar.");
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="botao-principal"
      >
        {textoAbrir ?? textoBotao}
      </button>
    );
  }

  return (
    <div className="cartao">
      {leitor ? <div className="mb-5">{leitor(preencher)}</div> : null}

      <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
        {campos.map((campo) => (
          <div
            key={campo.nome}
            className={
              campo.largo || campo.tipo === "textarea" ? "sm:col-span-2" : ""
            }
          >
            <label htmlFor={`campo-${campo.nome}`} className="rotulo">
              {campo.rotulo}
              {campo.obrigatorio ? (
                <span className="text-slate-400"> *</span>
              ) : null}
            </label>
            {campo.tipo === "select" ? (
              <select
                id={`campo-${campo.nome}`}
                name={campo.nome}
                required={campo.obrigatorio}
                value={valores[campo.nome] ?? ""}
                onChange={(evento) => mudar(campo.nome, evento.target.value)}
                className="campo"
              >
                <option value="">—</option>
                {campo.opcoes?.map((opcao) => (
                  <option key={opcao.valor} value={opcao.valor}>
                    {opcao.rotulo}
                  </option>
                ))}
              </select>
            ) : campo.tipo === "textarea" ? (
              <textarea
                id={`campo-${campo.nome}`}
                name={campo.nome}
                required={campo.obrigatorio}
                rows={4}
                value={valores[campo.nome] ?? ""}
                onChange={(evento) => mudar(campo.nome, evento.target.value)}
                className="campo"
              />
            ) : (
              <input
                id={`campo-${campo.nome}`}
                name={campo.nome}
                type={campo.tipo ?? "text"}
                required={campo.obrigatorio}
                value={valores[campo.nome] ?? ""}
                onChange={(evento) => mudar(campo.nome, evento.target.value)}
                className="campo"
              />
            )}
            {campo.ajuda ? <p className="ajuda">{campo.ajuda}</p> : null}
          </div>
        ))}

        {erro ? <p className="aviso-erro sm:col-span-2">{erro}</p> : null}

        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="submit" disabled={enviando} className="botao-principal">
            {enviando ? "Gravando..." : textoBotao}
          </button>
          {recolhivel ? (
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="botao-secundario"
            >
              Cancelar
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
