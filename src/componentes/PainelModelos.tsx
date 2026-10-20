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
      setErro(det?.erro ?? "Não consegui guardar o modelo.");
      return;
    }
    const desconhecidos: string[] = det?.desconhecidos ?? [];
    setAviso(
      desconhecidos.length > 0
        ? `Modelo guardado. Atencao: ${desconhecidos.map((d) => `{{${d}}}`).join(", ")} não é campo do sistema e vai sair escrito assim na peça.`
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
      setErro(det?.erro ?? "Não consegui trocar o modelo.");
      return;
    }
    setAviso(
      usar === "ESCRITORIO"
        ? "Fixado: as peças saem no modelo do escritório."
        : "Fixado: as peças saem no modelo do sistema. O do escritório continua guardado.",
    );
    router.refresh();
  }

  async function excluirOMeu(especie: string) {
    if (
      !confirm(
        "Excluir o modelo que o escritório enviou? O arquivo sai do sistema e passa a valer o modelo do sistema. As peças já geradas continuam como estão.",
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
      setErro(det?.erro ?? "Não consegui excluir o modelo.");
      return;
    }
    setAviso("Modelo do escritório excluído. Vale o do sistema.");
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <section className="cartao">
        <h2 className="font-semibold">Como funciona</h2>
        <ol className="mt-2 grid gap-1 text-sm text-slate-600">
          <li>
            1. Baixe o modelo que está valendo — o do escritório, ou o que já vem
            no sistema.
          </li>
          <li>
            2. Abra no Word e deixe do jeito do escritório: o timbre, a fonte, as
            cláusulas. Os campos entre chaves ficam como estão.
          </li>
          <li>3. Mande o arquivo de volta aqui. A partir daí, é esse que sai.</li>
          <li>
            4. Com o do escritório guardado, fixe qual sai nas peças — o do
            escritório ou o do sistema. Os dois ficam guardados, e trocar é um
            clique.
          </li>
        </ol>
        <p className="mt-3 text-sm text-amber-700">
          O modelo que já vem no sistema é só o ponto de partida, para o
          escritório novo conseguir emitir no primeiro dia. Antes de usar como
          esta, o advogado responsável lê e adapta: a redação e a
          responsabilidade são do escritório.
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
                        : "Em uso: modelo que já vem no sistema"}
                  </p>
                  {m.temProprio && podeTrocar ? (
                    <fieldset className="mt-2 flex flex-wrap gap-4 text-sm" disabled={ocupado === m.especie}>
                      <legend className="sr-only">Qual modelo sai nas peças de {m.nome}</legend>
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name={`usar-${m.especie}`}
                          checked={m.doEscritorio}
                          onChange={() => fixar(m.especie, "ESCRITORIO")}
                        />
                        Usar o do escritório
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
                      Nenhum campo reconhecido: a peça vai sair igual para todo
                      cliente. Confira se os campos estão escritos entre chaves
                      duplas.
                    </p>
                  ) : null}
                  {m.desconhecidos.length > 0 ? (
                    <p className="mt-1 text-xs text-amber-700">
                      Não são campos do sistema e vão sair escritos assim:{" "}
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
                      Baixar o do escritório
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
                          Excluir o do escritório
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
            Só o administrador do escritório envia, fixa ou exclui modelo.
            Baixar, todo mundo pode.
          </p>
        ) : null}
      </section>

      <section className="cartao">
        <h2 className="font-semibold">Campos que o sistema preenche</h2>
        <p className="mt-1 text-sm text-slate-600">
          Escreva no Word exatamente assim, com as chaves duplas. Campo que o
          sistema não conhece sai escrito como está na peça — de propósito, para
          o erro de digitação aparecer. Campo conhecido sem valor no cadastro sai
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
