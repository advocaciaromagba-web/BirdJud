"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type ModeloNaTela = {
  especie: string;
  nome: string;
  /** O que sai na peca hoje. */
  doEscritorio: boolean;
  /** Ha um modelo do escritorio guardado, em uso ou nao. */
  temProprio: boolean;
  nomeDoArquivo: string;
  usados: string[];
  desconhecidos: string[];
  enviadoEmBR: string | null;
};

export type CampoNaTela = { chave: string; sobre: string };

/**
 * Modelos de contrato, procuracao e declaracao.
 *
 * A ideia da tela em uma frase: baixe o que tem, edite no Word com o seu
 * timbre, devolva. "Usar o que ja vem" e "mandar o meu" sao o mesmo caminho,
 * com um passo no meio — e por isso nao ha editor aqui dentro.
 *
 * Com o modelo do escritorio guardado, a escolha de qual sai na peca e FIXADA
 * aqui (o do escritorio ou o do sistema), sem apagar nenhum dos dois. Excluir
 * o do escritorio e outra acao, com confirmacao.
 */
export function PainelModelos({
  modelos,
  campos,
  podeTrocar,
}: {
  modelos: ModeloNaTela[];
  campos: CampoNaTela[];
  podeTrocar: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const entradas = useRef<Record<string, HTMLInputElement | null>>({});

  async function enviar(especie: string, arquivo: File) {
    setOcupado(especie);
    setErro(null);
    setAviso(null);

    const corpo = new FormData();
    corpo.set("especie", especie);
    corpo.set("arquivo", arquivo);

    const resposta = await fetch("/api/modelos", { method: "POST", body: corpo });
    setOcupado(null);
    const det = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      setErro(det?.erro ?? "Nao consegui guardar o modelo.");
      return;
    }
    const desconhecidos: string[] = det?.desconhecidos ?? [];
    setAviso(
      desconhecidos.length > 0
        ? `Modelo guardado. Atencao: ${desconhecidos.map((d) => `{{${d}}}`).join(", ")} nao e campo do sistema e vai sair escrito assim na peca.`
        : `Modelo guardado, com ${det?.usados?.length ?? 0} campo(s) reconhecido(s).`,
    );
    router.refresh();
  }

  async function fixar(especie: string, usar: "ESCRITORIO" | "SISTEMA") {
    setOcupado(especie);
    setErro(null);
    setAviso(null);
    const resposta = await fetch(`/api/modelos/${especie}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usar }),
    });
    setOcupado(null);
    if (!resposta.ok) {
      const det = await resposta.json().catch(() => null);
      setErro(det?.erro ?? "Nao consegui trocar o modelo.");
      return;
    }
    setAviso(
      usar === "ESCRITORIO"
        ? "Fixado: as pecas saem no modelo do escritorio."
        : "Fixado: as pecas saem no modelo do sistema. O do escritorio continua guardado.",
    );
    router.refresh();
  }

  async function excluirOMeu(especie: string) {
    if (
      !confirm(
        "Excluir o modelo que o escritorio enviou? O arquivo sai do sistema e passa a valer o modelo do sistema. As pecas ja geradas continuam como estao.",
      )
    )
      return;
    setOcupado(especie);
    setErro(null);
    setAviso(null);
    const resposta = await fetch(`/api/modelos/${especie}`, { method: "DELETE" });
    setOcupado(null);
    if (!resposta.ok) {
      const det = await resposta.json().catch(() => null);
      setErro(det?.erro ?? "Nao consegui excluir o modelo.");
      return;
    }
    setAviso("Modelo do escritorio excluido. Vale o do sistema.");
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <section className="cartao">
        <h2 className="font-semibold">Como funciona</h2>
        <ol className="mt-2 grid gap-1 text-sm text-slate-600">
          <li>
            1. Baixe o modelo que esta valendo — o do escritorio, ou o que ja vem
            no sistema.
          </li>
          <li>
            2. Abra no Word e deixe do jeito do escritorio: o timbre, a fonte, as
            clausulas. Os campos entre chaves ficam como estao.
          </li>
          <li>3. Mande o arquivo de volta aqui. A partir dai, e esse que sai.</li>
          <li>
            4. Com o do escritorio guardado, fixe qual sai nas pecas — o do
            escritorio ou o do sistema. Os dois ficam guardados, e trocar e um
            clique.
          </li>
        </ol>
        <p className="mt-3 text-sm text-amber-700">
          O modelo que ja vem no sistema e so o ponto de partida, para o
          escritorio novo conseguir emitir no primeiro dia. Antes de usar como
          esta, o advogado responsavel le e adapta: a redacao e a
          responsabilidade sao do escritorio.
        </p>
        {aviso ? <p className="mt-3 text-sm text-emerald-700">{aviso}</p> : null}
        {erro ? <p className="aviso-erro mt-3">{erro}</p> : null}
      </section>

      <section>
        <h2 className="font-semibold">Os modelos</h2>
        <ul className="mt-3 grid gap-3">
          {modelos.map((m) => (
            <li
              key={m.especie}
              className="rounded-[var(--raio)] border border-slate-200 bg-white px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{m.nome}</p>
                  <p className="text-xs text-slate-500">
                    {m.doEscritorio
                      ? `Em uso: modelo do escritorio — ${m.nomeDoArquivo}${m.enviadoEmBR ? `, enviado em ${m.enviadoEmBR}` : ""}`
                      : m.temProprio
                        ? `Em uso: modelo do sistema. Guardado: ${m.nomeDoArquivo}${m.enviadoEmBR ? `, enviado em ${m.enviadoEmBR}` : ""}`
                        : "Em uso: modelo que ja vem no sistema"}
                  </p>
                  {m.temProprio && podeTrocar ? (
                    <fieldset className="mt-2 flex flex-wrap gap-4 text-sm" disabled={ocupado === m.especie}>
                      <legend className="sr-only">Qual modelo sai nas pecas de {m.nome}</legend>
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name={`usar-${m.especie}`}
                          checked={m.doEscritorio}
                          onChange={() => fixar(m.especie, "ESCRITORIO")}
                        />
                        Usar o do escritorio
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name={`usar-${m.especie}`}
                          checked={!m.doEscritorio}
                          onChange={() => fixar(m.especie, "SISTEMA")}
                        />
                        Usar o do sistema
                      </label>
                    </fieldset>
                  ) : null}
                  {m.temProprio && m.usados.length > 0 ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Campos no modelo: {m.usados.map((u) => `{{${u}}}`).join(", ")}
                    </p>
                  ) : null}
                  {m.temProprio && m.usados.length === 0 ? (
                    <p className="mt-1 text-xs text-amber-700">
                      Nenhum campo reconhecido: a peca vai sair igual para todo
                      cliente. Confira se os campos estao escritos entre chaves
                      duplas.
                    </p>
                  ) : null}
                  {m.desconhecidos.length > 0 ? (
                    <p className="mt-1 text-xs text-amber-700">
                      Nao sao campos do sistema e vao sair escritos assim:{" "}
                      {m.desconhecidos.map((d) => `{{${d}}}`).join(", ")}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <a
                    href={`/api/modelos/${m.especie}?qual=sistema`}
                    className="botao-secundario"
                    download
                  >
                    Baixar o do sistema
                  </a>
                  {m.temProprio ? (
                    <a
                      href={`/api/modelos/${m.especie}?qual=escritorio`}
                      className="botao-secundario"
                      download
                    >
                      Baixar o do escritorio
                    </a>
                  ) : null}
                  {podeTrocar ? (
                    <>
                      <input
                        ref={(el) => {
                          entradas.current[m.especie] = el;
                        }}
                        type="file"
                        accept=".docx"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void enviar(m.especie, f);
                        }}
                      />
                      <button
                        type="button"
                        disabled={ocupado === m.especie}
                        onClick={() => entradas.current[m.especie]?.click()}
                        className="botao-principal disabled:opacity-50"
                      >
                        {ocupado === m.especie ? "Enviando..." : m.temProprio ? "Enviar outro" : "Enviar o meu"}
                      </button>
                      {m.temProprio ? (
                        <button
                          type="button"
                          disabled={ocupado === m.especie}
                          onClick={() => excluirOMeu(m.especie)}
                          className="botao-secundario disabled:opacity-50"
                        >
                          Excluir o do escritorio
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {!podeTrocar ? (
          <p className="mt-3 text-sm text-slate-600">
            Só o administrador do escritorio envia, fixa ou exclui modelo.
            Baixar, todo mundo pode.
          </p>
        ) : null}
      </section>

      <section className="cartao">
        <h2 className="font-semibold">Campos que o sistema preenche</h2>
        <p className="mt-1 text-sm text-slate-600">
          Escreva no Word exatamente assim, com as chaves duplas. Campo que o
          sistema nao conhece sai escrito como esta na peca — de proposito, para
          o erro de digitacao aparecer. Campo conhecido sem valor no cadastro sai
          marcado, nunca em branco.
        </p>
        <ul className="mt-3 grid gap-1 sm:grid-cols-2">
          {campos.map((c) => (
            <li key={c.chave} className="text-sm">
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
                {`{{${c.chave}}}`}
              </code>
              <span className="ml-2 text-slate-600">{c.sobre}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
