"use client";

import { useState } from "react";
import {
  ajudaDoPerfil,
  rotuloDoCampo,
  type Confianca,
  type Leitura,
  type Perfil,
} from "@/lib/leitura-documento";
import { Icone } from "./Icone";

const ETIQUETA_DA_CONFIANCA: Record<Confianca, string> = {
  ALTA: "etiqueta-ok",
  MEDIA: "etiqueta-atencao",
  BAIXA: "etiqueta-erro",
};

const TEXTO_DA_CONFIANCA: Record<Confianca, string> = {
  ALTA: "leitura clara",
  MEDIA: "confira",
  BAIXA: "confira com atencao",
};

/**
 * Manda os documentos, mostra o que a IA leu e deixa a pessoa escolher o que
 * aplicar.
 *
 * Este componente nao grava nada: ele preenche os campos do formulario que
 * esta na mesma tela. Quem grava continua sendo quem clica em cadastrar,
 * depois de olhar. Campo que a IA leu mal chega marcado, nao chega escondido.
 */
export function LeitorDeDocumentos({
  perfil,
  aoAplicar,
}: {
  perfil: Perfil;
  aoAplicar: (campos: Record<string, string>) => void;
}) {
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [descartados, setDescartados] = useState<Set<string>>(new Set());
  const [aplicado, setAplicado] = useState(false);

  const campos = leitura ? Object.entries(leitura.campos) : [];

  async function ler(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const dados = new FormData(form);
    dados.set("perfil", perfil);

    if (
      dados.getAll("arquivos").filter((a) => a instanceof File && a.size > 0)
        .length === 0
    ) {
      setErro("Escolha os documentos primeiro.");
      return;
    }

    setLendo(true);
    setErro(null);
    setAplicado(false);

    const resposta = await fetch("/api/ia/leitura", {
      method: "POST",
      body: dados,
    });
    setLendo(false);

    const json = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      setErro(json.erro ?? "Nao foi possivel ler os documentos.");
      return;
    }
    setLeitura(json.leitura as Leitura);
    setDescartados(new Set());
  }

  function alternar(chave: string) {
    setDescartados((atuais) => {
      const novos = new Set(atuais);
      if (novos.has(chave)) novos.delete(chave);
      else novos.add(chave);
      return novos;
    });
  }

  function aplicar() {
    if (!leitura) return;
    const aprovados: Record<string, string> = {};
    for (const [chave, campo] of Object.entries(leitura.campos)) {
      if (!descartados.has(chave)) aprovados[chave] = campo.valor;
    }
    aoAplicar(aprovados);
    setAplicado(true);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-[color:var(--marca-primaria)]">
          <Icone nome="ia" />
        </span>
        <div className="min-w-0">
          <h3>Preencher a partir de um documento</h3>
          <p className="ajuda">{ajudaDoPerfil(perfil)}</p>
        </div>
      </div>

      <form onSubmit={ler} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="arquivos"
          multiple
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="campo max-w-full file:mr-3 file:rounded file:border-0 file:bg-slate-200 file:px-3 file:py-1 file:text-sm sm:max-w-xs"
        />
        <button type="submit" className="botao-secundario" disabled={lendo}>
          {lendo ? "Lendo..." : "Ler documentos"}
        </button>
      </form>

      {erro ? <p className="aviso-erro mt-3">{erro}</p> : null}

      {leitura && campos.length === 0 ? (
        <p className="aviso-atencao mt-3">
          A IA nao encontrou nenhum dos campos deste cadastro nos documentos
          enviados.
        </p>
      ) : null}

      {campos.length > 0 ? (
        <div className="mt-4">
          <p className="sobretitulo">O que a IA leu</p>
          <ul className="mt-2 grid gap-2">
            {campos.map(([chave, campo]) => {
              const fora = descartados.has(chave);
              return (
                <li
                  key={chave}
                  className={`rounded-lg border bg-white p-3 text-sm ${
                    fora ? "border-slate-200 opacity-50" : "border-slate-300"
                  }`}
                >
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={!fora}
                      onChange={() => alternar(chave)}
                      className="mt-1 h-4 w-4"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium text-slate-500">
                          {rotuloDoCampo(perfil, chave)}
                        </span>
                        <span
                          className={ETIQUETA_DA_CONFIANCA[campo.confianca]}
                        >
                          {TEXTO_DA_CONFIANCA[campo.confianca]}
                        </span>
                      </span>
                      <span className="block font-semibold">{campo.valor}</span>
                      {campo.origem ? (
                        <span className="ajuda block">
                          no documento: {campo.origem}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          {leitura?.observacoes.length ? (
            <ul className="mt-3 grid gap-2">
              {leitura.observacoes.map((observacao, indice) => (
                <li key={indice} className="aviso-atencao">
                  {observacao}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={aplicar} className="botao-principal">
              Preencher o formulario
            </button>
            {aplicado ? (
              <span className="text-sm text-slate-600">
                Preenchido. Confira os campos antes de gravar.
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
