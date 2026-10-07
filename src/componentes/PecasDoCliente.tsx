"use client";

import { useState } from "react";

const ESPECIES = [
  { chave: "CONTRATO", rotulo: "Contrato de honorarios" },
  { chave: "PROCURACAO", rotulo: "Procuracao" },
  { chave: "DECLARACAO", rotulo: "Declaracao de hipossuficiencia" },
  { chave: "RECIBO", rotulo: "Recibo de pagamento de honorarios" },
];

const FORMATOS = [
  {
    chave: "PDF",
    rotulo: "PDF",
    sobre: "para assinar, imprimir ou mandar para o cliente",
  },
  {
    chave: "DOCX",
    rotulo: "Word (.docx)",
    sobre: "para editar antes, no papel timbrado do escritorio",
  },
];

/** A peca conferida: o arquivo que acabou de sair, ainda na tela. */
type Conferida = {
  chave: string;
  rotulo: string;
  url: string;
  nome: string;
  doEscritorio: boolean;
  temImagem: boolean;
  semValor: string[];
  desconhecidos: string[];
  caracteresTrocados: string;
  paginas: string;
};

export type AdvogadoEscolhivel = { id: string; nome: string; oab: string | null };

/**
 * Gerar os documentos deste cliente.
 *
 * Marca-se o que precisa e sai de uma vez. Quase sempre sao os tres juntos —
 * contrato, procuracao e declaracao — e obrigar tres idas a tela para o que e
 * um gesto so era pedir que alguem esquecesse um.
 *
 * A CONFERENCIA VEM ANTES. O que a peca tem de errado — campo sem valor no
 * cadastro, campo que nao existe no sistema — tem de aparecer enquanto ainda da
 * para arrumar, nao no papel que o cliente ja assinou. Por isso a conferencia
 * mostra o PDF de verdade, na tela, e so dali se baixa, se imprime ou se manda
 * para assinatura.
 */
export function PecasDoCliente({
  clienteId,
  advogados,
  escolhidosNoCliente,
}: {
  clienteId: string;
  /** Quem assina pecas no escritorio. */
  advogados: AdvogadoEscolhivel[];
  /** A escolha gravada neste cliente. Vazio = todos. */
  escolhidosNoCliente: string[];
}) {
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  // PDF por padrao: e o que se assina, o que se imprime igual em qualquer
  // computador e o que a assinatura eletronica aceita.
  const [formatos, setFormatos] = useState<Set<string>>(new Set(["PDF"]));
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [conferidas, setConferidas] = useState<Conferida[]>([]);
  const [recibo, setRecibo] = useState({ valor: "", referenteA: "", forma: "", data: "" });
  // Vazio significa todos: e assim que esta gravado, e e assim que a tela
  // comeca. Marcar os dez para dizer "todos" seria trabalho sem ganho.
  const [quemAssina, setQuemAssina] = useState<Set<string>>(
    new Set(escolhidosNoCliente),
  );

  const todosAssinam = quemAssina.size === 0;
  function alternarAdvogado(id: string) {
    setQuemAssina((atual) => {
      const novo = new Set(atual);
      // Primeira marcacao a partir de "todos": comeca so com o escolhido.
      if (novo.size === 0) return new Set([id]);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  const quer = (e: string) => marcadas.has(e);
  function alternar(e: string) {
    setMarcadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(e)) novo.delete(e);
      else novo.add(e);
      return novo;
    });
  }

  function alternarFormato(f: string) {
    setFormatos((atual) => {
      const novo = new Set(atual);
      if (novo.has(f)) novo.delete(f);
      else novo.add(f);
      // Sem formato nenhum nao ha o que baixar. Desmarcar o ultimo nao pode
      // deixar o botao sem significado.
      return novo.size === 0 ? atual : novo;
    });
  }

  function corpoDoPedido(
    especie: string,
    opcoes: { formato: string; guardar: boolean },
  ) {
    return JSON.stringify({
      clienteId,
      formato: opcoes.formato,
      advogadoIds: [...quemAssina],
      // Gravar a escolha so quando a peca sai de verdade, nao na conferencia.
      guardarAdvogados: opcoes.guardar && quemAssina.size > 0,
      ...(especie === "RECIBO"
        ? {
            reciboValor: recibo.valor || null,
            reciboReferenteA: recibo.referenteA || null,
            reciboForma: recibo.forma || null,
            reciboData: recibo.data || null,
          }
        : {}),
    });
  }

  const escolhidas = ESPECIES.filter((e) => quer(e.chave));

  async function pedir(especie: string, formato: string, guardar: boolean) {
    const resposta = await fetch(`/api/modelos/${especie}/peca`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: corpoDoPedido(especie, { formato, guardar }),
    });
    if (!resposta.ok) {
      const det = await resposta.json().catch(() => null);
      throw new Error(det?.erro ?? "nao consegui montar.");
    }
    return resposta;
  }

  function nomeDe(resposta: Response, especie: string, formato: string) {
    return (
      resposta.headers.get("x-nome-do-arquivo") ??
      `${especie.toLowerCase()}.${formato.toLowerCase()}`
    );
  }

  function baixarBlob(url: string, nome: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
  }

  function esquecerConferidas() {
    for (const c of conferidas) URL.revokeObjectURL(c.url);
    setConferidas([]);
  }

  /** Monta as pecas e mostra o PDF na tela, antes de qualquer download. */
  async function conferir() {
    setOcupado(true);
    setErro(null);
    esquecerConferidas();
    const achadas: Conferida[] = [];

    try {
      for (const e of escolhidas) {
        // A conferencia e sempre em PDF: e o unico formato que o navegador
        // mostra. O .docx continua disponivel ao lado.
        const resposta = await pedir(e.chave, "PDF", false);
        const lista = (nome: string) =>
          (resposta.headers.get(nome) ?? "").split(",").filter(Boolean);
        achadas.push({
          chave: e.chave,
          rotulo: e.rotulo,
          url: URL.createObjectURL(await resposta.blob()),
          nome: nomeDe(resposta, e.chave, "PDF"),
          doEscritorio: resposta.headers.get("x-modelo-do-escritorio") === "1",
          temImagem: resposta.headers.get("x-modelo-tem-imagem") === "1",
          semValor: lista("x-campos-sem-valor"),
          desconhecidos: lista("x-campos-desconhecidos"),
          caracteresTrocados: decodeURIComponent(
            resposta.headers.get("x-caracteres-trocados") ?? "",
          ),
          paginas: resposta.headers.get("x-paginas") ?? "",
        });
      }
      setConferidas(achadas);
    } catch (falha) {
      for (const c of achadas) URL.revokeObjectURL(c.url);
      setErro(falha instanceof Error ? falha.message : "nao consegui montar.");
    } finally {
      setOcupado(false);
    }
  }

  /** Baixa o que esta marcado, em cada formato marcado. */
  async function baixar() {
    setOcupado(true);
    setErro(null);
    try {
      // Um arquivo por documento e por formato, nao um pacote: cada peca vai
      // para um lugar diferente — uma para assinar, outra para juntar aos autos.
      for (const e of escolhidas) {
        for (const f of FORMATOS.filter((f) => formatos.has(f.chave))) {
          const resposta = await pedir(e.chave, f.chave, true);
          const url = URL.createObjectURL(await resposta.blob());
          baixarBlob(url, nomeDe(resposta, e.chave, f.chave));
          URL.revokeObjectURL(url);
          // O navegador ignora downloads disparados juntos demais.
          await new Promise((ok) => setTimeout(ok, 350));
        }
      }
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "nao consegui montar.");
    } finally {
      setOcupado(false);
    }
  }

  async function baixarWord(c: Conferida) {
    setOcupado(true);
    setErro(null);
    try {
      const resposta = await pedir(c.chave, "DOCX", true);
      const url = URL.createObjectURL(await resposta.blob());
      baixarBlob(url, nomeDe(resposta, c.chave, "DOCX"));
      URL.revokeObjectURL(url);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "nao consegui montar.");
    } finally {
      setOcupado(false);
    }
  }

  function imprimir(c: Conferida) {
    // Abrir em aba propria e pedir a impressao: o visualizador de PDF do
    // navegador imprime o que esta vendo. Se o bloqueador de janelas barrar, a
    // aba nao abre — e por isso o botao "abrir" fica ao lado.
    const janela = window.open(c.url, "_blank");
    if (!janela) {
      setErro(
        "O navegador bloqueou a janela de impressao. Use 'Abrir' e imprima pela aba.",
      );
      return;
    }
    janela.addEventListener("load", () => janela.print());
  }

  const quantosFormatos = FORMATOS.filter((f) => formatos.has(f.chave)).length;

  return (
    <section className="cartao mt-6">
      <h2 className="font-semibold">Gerar documentos</h2>
      <p className="mt-1 text-sm text-slate-600">
        Marque o que precisa. Sai no modelo do escritorio, com os dados deste
        cliente e do contrato de honorarios dele. Confira na tela antes de
        baixar, imprimir ou mandar para assinatura.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {ESPECIES.map((e) => (
          <label
            key={e.chave}
            className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={quer(e.chave)}
              onChange={() => alternar(e.chave)}
            />
            {e.rotulo}
          </label>
        ))}
      </div>

      <div className="mt-3 rounded border border-slate-200 p-3">
        <p className="text-sm font-medium">Em que formato</p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {FORMATOS.map((f) => (
            <li key={f.chave}>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={formatos.has(f.chave)}
                  onChange={() => alternarFormato(f.chave)}
                />
                <span>
                  {f.rotulo}
                  <span className="block text-xs text-slate-500">{f.sobre}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          O .docx e o arquivo do escritorio, inteiro: timbre, fonte e formatacao
          como estao no modelo. O PDF e o mesmo texto, com os mesmos valores,
          desenhado pelo BirdJud em A4 — imagem do timbre e formatacao propria
          do Word nao atravessam. Para um PDF identico ao papel do escritorio,
          baixe o .docx e exporte do Word.
        </p>
      </div>

      {advogados.length > 1 ? (
        <div className="mt-3 rounded border border-slate-200 p-3">
          <p className="text-sm font-medium">Quem assina</p>
          <p className="mt-1 text-xs text-slate-600">
            Sem marcar ninguem, saem todos — que e o certo na maioria das
            bancas. Marque quando a peca for so de alguns: uma procuracao
            outorgando poderes a dez advogados quando dois vao atuar da poder a
            mais gente do que o cliente quis. A escolha fica guardada neste
            cliente para a proxima vez.
          </p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {advogados.map((a) => (
              <li key={a.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={todosAssinam || quemAssina.has(a.id)}
                    onChange={() => alternarAdvogado(a.id)}
                  />
                  {a.nome}
                  {a.oab ? (
                    <span className="text-xs text-slate-500">{a.oab}</span>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            {todosAssinam
              ? `Todos os ${advogados.length} assinam.`
              : `${quemAssina.size} de ${advogados.length} assinam.`}
            {!todosAssinam ? (
              <button
                type="button"
                className="botao-discreto ml-2"
                onClick={() => setQuemAssina(new Set())}
              >
                voltar para todos
              </button>
            ) : null}
          </p>
        </div>
      ) : null}

      {quer("RECIBO") ? (
        <div className="mt-3 grid gap-3 rounded border border-slate-200 p-3 sm:grid-cols-2">
          <p className="text-xs text-slate-600 sm:col-span-2">
            Em branco, o recibo sai da ultima cobranca paga deste cliente. Dinheiro
            que entrou por fora do sistema precisa ser digitado: inventar o numero
            de um recibo seria dar quitacao de um valor que ninguem conferiu.
          </p>
          <div>
            <label className="rotulo" htmlFor="rec-valor">
              Valor recebido (R$)
            </label>
            <input
              id="rec-valor"
              className="campo"
              inputMode="decimal"
              value={recibo.valor}
              onChange={(e) => setRecibo({ ...recibo, valor: e.target.value })}
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="rec-data">
              Data do pagamento
            </label>
            <input
              id="rec-data"
              className="campo"
              type="date"
              value={recibo.data}
              onChange={(e) => setRecibo({ ...recibo, data: e.target.value })}
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="rec-ref">
              Referente a
            </label>
            <input
              id="rec-ref"
              className="campo"
              maxLength={200}
              placeholder="honorarios da acao trabalhista"
              value={recibo.referenteA}
              onChange={(e) => setRecibo({ ...recibo, referenteA: e.target.value })}
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="rec-forma">
              Como foi pago
            </label>
            <input
              id="rec-forma"
              className="campo"
              maxLength={40}
              placeholder="Pix"
              value={recibo.forma}
              onChange={(e) => setRecibo({ ...recibo, forma: e.target.value })}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={ocupado || escolhidas.length === 0}
          onClick={conferir}
          className="botao-principal disabled:opacity-50"
        >
          {ocupado ? "..." : "Conferir na tela"}
        </button>
        <button
          type="button"
          disabled={ocupado || escolhidas.length === 0}
          onClick={baixar}
          className="botao-secundario disabled:opacity-50"
        >
          {escolhidas.length * quantosFormatos > 1
            ? `Baixar os ${escolhidas.length * quantosFormatos}`
            : "Baixar"}
        </button>
        {conferidas.length > 0 ? (
          <button type="button" className="botao-discreto" onClick={esquecerConferidas}>
            fechar conferencia
          </button>
        ) : null}
      </div>

      {erro ? <p className="aviso-erro mt-3">{erro}</p> : null}

      {conferidas.map((c) => (
        <div key={c.chave} className="mt-4 border-t border-slate-200 pt-4">
          <p className="text-sm font-medium">{c.rotulo}</p>
          <p className="text-xs text-slate-500">
            {c.doEscritorio
              ? "Modelo do escritorio."
              : "Modelo que ja vem no sistema — pode ser trocado em Modelos."}
            {c.paginas ? ` ${c.paginas} pagina${c.paginas === "1" ? "" : "s"}.` : ""}
          </p>

          {c.semValor.length > 0 ? (
            <p className="mt-1 text-xs text-amber-700">
              Sem valor no cadastro, e por isso marcado na peca: {c.semValor.join(", ")}.
            </p>
          ) : null}
          {c.desconhecidos.length > 0 ? (
            <p className="mt-1 text-xs text-amber-700">
              O modelo pede campos que o sistema nao conhece:{" "}
              {c.desconhecidos.map((d) => `{{${d}}}`).join(", ")}.
            </p>
          ) : null}
          {c.temImagem ? (
            <p className="mt-1 text-xs text-amber-700">
              O modelo tem imagem — em geral o timbre. Ela sai no .docx, mas NAO
              neste PDF. Se o timbre precisa aparecer, baixe o .docx e exporte o
              PDF pelo Word.
            </p>
          ) : null}
          {c.caracteresTrocados ? (
            <p className="mt-1 text-xs text-amber-700">
              Caracteres que a fonte do PDF nao escreve sairam como &quot;?&quot;:{" "}
              {[...c.caracteresTrocados].join(" ")}. Confira onde aparecem.
            </p>
          ) : null}

          <iframe
            title={`Conferencia: ${c.rotulo}`}
            src={c.url}
            className="mt-2 h-[32rem] w-full rounded border border-slate-200 bg-slate-50"
          />

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="botao-secundario"
              onClick={() => baixarBlob(c.url, c.nome)}
            >
              Baixar PDF
            </button>
            <button
              type="button"
              disabled={ocupado}
              className="botao-secundario disabled:opacity-50"
              onClick={() => baixarWord(c)}
            >
              Baixar Word
            </button>
            <button type="button" className="botao-secundario" onClick={() => imprimir(c)}>
              Imprimir
            </button>
            <a
              className="botao-discreto"
              href={c.url}
              target="_blank"
              rel="noreferrer"
            >
              abrir em outra aba
            </a>
          </div>
        </div>
      ))}
    </section>
  );
}
