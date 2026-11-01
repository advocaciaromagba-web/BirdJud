"use client";

import { useState } from "react";

const ESPECIES = [
  { chave: "CONTRATO", rotulo: "Contrato de honorários" },
  { chave: "PROCURACAO", rotulo: "Procuração" },
  { chave: "DECLARACAO", rotulo: "Declaração de hipossuficiência" },
  { chave: "RECIBO", rotulo: "Recibo de pagamento de honorários" },
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
    sobre: "para editar antes, no papel timbrado do escritório",
  },
];

/** A peca conferida: o arquivo que acabou de sair, ainda na tela. */
type Conferida = {
  /** Unica na tela: "PROCURACAO#2" quando ha uma procuracao por acao. */
  chave: string;
  especie: string;
  /** So na procuracao: a acao desta via. */
  acao: string | null;
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

export type SignatarioNaTela = {
  nome: string;
  email: string;
  link: string | null;
  assinadoEm: string | null;
  recusadoEm: string | null;
};

export type EnvioNaTela = {
  id: string;
  especie: string;
  situacao: string;
  criadoEm: string;
  signatarios: SignatarioNaTela[];
};

/** Quem assina cada especie, por padrao. Igual a ASSINA_POR_PADRAO do servidor. */
const ASSINA_POR_PADRAO: Record<string, "CLIENTE" | "ESCRITORIO" | "AMBOS"> = {
  CONTRATO: "AMBOS",
  PROCURACAO: "CLIENTE",
  DECLARACAO: "CLIENTE",
  RECIBO: "ESCRITORIO",
};

const QUEM_ASSINA = [
  { chave: "CLIENTE", rotulo: "só o cliente" },
  { chave: "ESCRITORIO", rotulo: "só o escritório" },
  { chave: "AMBOS", rotulo: "cliente e escritório" },
];

const SITUACAO: Record<string, { rotulo: string; cor: string }> = {
  ENVIADO: { rotulo: "aguardando assinatura", cor: "text-slate-600" },
  PARCIAL: { rotulo: "assinado em parte", cor: "text-amber-700" },
  ASSINADO: { rotulo: "assinado", cor: "text-emerald-700" },
  RECUSADO: { rotulo: "recusado", cor: "text-red-700" },
};

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
  assinaturaLigada = false,
  whatsappLigado = false,
  telefoneDoCliente = null,
  emailLigado = false,
  emailDoCliente = null,
  envios = [],
  notaFiscalLigada = false,
  acoesContratadas = [],
}: {
  clienteId: string;
  /** Quem assina pecas no escritorio. */
  advogados: AdvogadoEscolhivel[];
  /** A escolha gravada neste cliente. Vazio = todos. */
  escolhidosNoCliente: string[];
  /** Modulo contratado E Autentique conectado. */
  assinaturaLigada?: boolean;
  /** Modulo de WhatsApp contratado. */
  whatsappLigado?: boolean;
  /** Telefone do CADASTRO. Nao ha campo para digitar outro, de proposito. */
  telefoneDoCliente?: string | null;
  /** Modulo de e-mail contratado (o escritorio manda pelo proprio remetente). */
  emailLigado?: boolean;
  /** E-mail do CADASTRO. Mesma regra do telefone. */
  emailDoCliente?: string | null;
  envios?: EnvioNaTela[];
  /** Modulo NFSE: o recibo oferece preparar a nota fiscal (nunca sozinho). */
  notaFiscalLigada?: boolean;
  /** Acoes do cadastro: uma procuracao para cada. */
  acoesContratadas?: string[];
}) {
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  // PDF por padrao: e o que se assina, o que se imprime igual em qualquer
  // computador e o que a assinatura eletronica aceita.
  const [formatos, setFormatos] = useState<Set<string>>(new Set(["PDF"]));
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [conferidas, setConferidas] = useState<Conferida[]>([]);
  const [recibo, setRecibo] = useState({ valor: "", referenteA: "", forma: "", data: "" });
  // Recado de quem manda por e-mail: "segue para assinatura ate sexta".
  const [recado, setRecado] = useState("");
  // Vazio significa todos: e assim que esta gravado, e e assim que a tela
  // comeca. Marcar os dez para dizer "todos" seria trabalho sem ganho.
  const [quemAssina, setQuemAssina] = useState<Set<string>>(
    new Set(escolhidosNoCliente),
  );
  const [enviados, setEnviados] = useState<EnvioNaTela[]>(envios);
  const [enviando, setEnviando] = useState<string | null>(null);
  // Reenvio do link a quem nao assinou. O resultado sai na propria linha de
  // quem foi clicado: escrito no rodape do formulario, ficava fora da tela e
  // parecia que nada tinha acontecido.
  const [naLinha, setNaLinha] = useState<Record<string, { ok: boolean; texto: string }>>({});
  const [lote, setLote] = useState<{ ids: Set<string>; canais: Set<"EMAIL" | "WHATSAPP">; recado: string }>({
    ids: new Set(),
    canais: new Set(["EMAIL"]),
    recado: "",
  });
  const [resultadoDoLote, setResultadoDoLote] = useState<{ ok: boolean; texto: string } | null>(null);
  const [assinam, setAssinam] = useState<Record<string, string>>({});
  // Uma procuracao por acao. A lista fica no cadastro (procuracao costuma ser
  // refeita depois: substabelecimento, troca de advogado, via perdida); aqui
  // se marca quais saem agora.
  const [acoes, setAcoes] = useState<string[]>(acoesContratadas);
  const [acoesAgora, setAcoesAgora] = useState<Set<string>>(new Set(acoesContratadas));
  const [novaAcao, setNovaAcao] = useState("");
  const [gravandoAcoes, setGravandoAcoes] = useState(false);

  async function gravarAcoes(lista: string[]) {
    setGravandoAcoes(true);
    setErro(null);
    try {
      const r = await fetch(`/api/clientes/${clienteId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acoesContratadas: lista }),
      });
      if (!r.ok) {
        const det = await r.json().catch(() => null);
        setErro(det?.erro ?? "Não consegui gravar as ações.");
        return false;
      }
      setAcoes(lista);
      return true;
    } finally {
      setGravandoAcoes(false);
    }
  }

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
    opcoes: { formato: string; guardar: boolean; acao?: string | null },
  ) {
    return JSON.stringify({
      clienteId,
      acao: opcoes.acao ?? null,
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

  // Cada peca que sai: a procuracao vira uma por acao marcada.
  const escolhidas = ESPECIES.filter((e) => quer(e.chave)).flatMap((e) => {
    const marcadasAgora = acoes.filter((a) => acoesAgora.has(a));
    if (e.chave === "PROCURACAO" && marcadasAgora.length > 0) {
      return marcadasAgora.map((acao, i) => ({
        chave: `PROCURACAO#${i + 1}`,
        especie: "PROCURACAO",
        acao,
        rotulo: `Procuração — ${acao}`,
      }));
    }
    return [{ chave: e.chave, especie: e.chave, acao: null as string | null, rotulo: e.rotulo }];
  });

  async function pedir(peca: { especie: string; acao: string | null }, formato: string, guardar: boolean) {
    const resposta = await fetch(`/api/modelos/${peca.especie}/peca`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: corpoDoPedido(peca.especie, { formato, guardar, acao: peca.acao }),
    });
    if (!resposta.ok) {
      const det = await resposta.json().catch(() => null);
      throw new Error(det?.erro ?? "não consegui montar.");
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
        const resposta = await pedir(e, "PDF", false);
        const lista = (nome: string) =>
          (resposta.headers.get(nome) ?? "").split(",").filter(Boolean);
        achadas.push({
          chave: e.chave,
          especie: e.especie,
          acao: e.acao,
          rotulo: e.rotulo,
          url: URL.createObjectURL(await resposta.blob()),
          nome: nomeDe(resposta, e.especie, "PDF"),
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
      setErro(falha instanceof Error ? falha.message : "não consegui montar.");
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
          const resposta = await pedir(e, f.chave, true);
          const url = URL.createObjectURL(await resposta.blob());
          baixarBlob(url, nomeDe(resposta, e.especie, f.chave));
          URL.revokeObjectURL(url);
          // O navegador ignora downloads disparados juntos demais.
          await new Promise((ok) => setTimeout(ok, 350));
        }
      }
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "não consegui montar.");
    } finally {
      setOcupado(false);
    }
  }

  async function baixarWord(c: Conferida) {
    setOcupado(true);
    setErro(null);
    try {
      const resposta = await pedir(c, "DOCX", true);
      const url = URL.createObjectURL(await resposta.blob());
      baixarBlob(url, nomeDe(resposta, c.especie, "DOCX"));
      URL.revokeObjectURL(url);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "não consegui montar.");
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
        "O navegador bloqueou a janela de impressão. Use 'Abrir' e imprima pela aba.",
      );
      return;
    }
    janela.addEventListener("load", () => janela.print());
  }

  /** Manda a peca para assinatura. Cada envio custa ao escritorio. */
  async function mandarAssinar(c: Conferida, mesmoAssim = false) {
    setEnviando(c.chave);
    setErro(null);
    try {
      const resposta = await fetch(`/api/modelos/${c.especie}/assinatura`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clienteId,
          acao: c.acao,
          advogadoIds: [...quemAssina],
          quemAssina: assinam[c.chave] ?? ASSINA_POR_PADRAO[c.especie as keyof typeof ASSINA_POR_PADRAO],
          mesmoAssim,
        }),
      });
      const det = await resposta.json().catch(() => null);

      if (resposta.status === 409 && det?.envioId && !mesmoAssim) {
        // Nao e erro: e a pergunta. O envio anterior ainda esta de pe, e
        // mandar de novo manda outro e-mail e custa outro documento.
        const outra = window.confirm(
          `${det.erro}\nO envio anterior esta ${
            SITUACAO[det.situacao]?.rotulo ?? det.situacao
          }.\n\nMandar assim mesmo? Sai outro e-mail para o cliente, e o provedor cobra outro documento.`,
        );
        if (outra) await mandarAssinar(c, true);
        return;
      }
      if (!resposta.ok) {
        setErro(`${c.rotulo}: ${det?.erro ?? "não consegui mandar para assinatura."}`);
        return;
      }
      setEnviados((atual) => [det.envio as EnvioNaTela, ...atual]);
    } catch {
      setErro("Não consegui falar com o servidor.");
    } finally {
      setEnviando(null);
    }
  }

  /** Manda o PDF ao cliente, pelo WhatsApp ou pelo e-mail do cadastro. */
  async function mandar(c: Conferida, canal: "WHATSAPP" | "EMAIL") {
    setEnviando(`${canal === "EMAIL" ? "email" : "zap"}:${c.chave}`);
    setErro(null);
    setAviso(null);
    try {
      const resposta = await fetch(`/api/modelos/${c.especie}/mandar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          canal,
          recado: canal === "EMAIL" ? recado.trim() || null : null,
          clienteId,
          acao: c.acao,
          advogadoIds: [...quemAssina],
          ...(c.especie === "RECIBO"
            ? {
                reciboValor: recibo.valor || null,
                reciboReferenteA: recibo.referenteA || null,
                reciboForma: recibo.forma || null,
                reciboData: recibo.data || null,
              }
            : {}),
        }),
      });
      const det = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setErro(`${c.rotulo}: ${det?.erro ?? "não consegui mandar."}`);
        return;
      }
      setAviso(
        canal === "EMAIL"
          ? `${c.rotulo} enviada para ${det.mandado.email} por e-mail.`
          : `${c.rotulo} enviada para ${det.mandado.telefone} no WhatsApp.`,
      );
    } catch {
      setErro("Não consegui falar com o servidor.");
    } finally {
      setEnviando(null);
    }
  }

  /** Junta o que saiu, o que falhou e o que ficou de fora numa frase so. */
  function resumoDoReenvio(r: { enviados?: string[]; falhas?: string[]; ignorados?: { documento: string; motivo: string }[]; erro?: string }) {
    if (r.erro) return { ok: false, texto: r.erro };
    const partes = [
      ...(r.enviados ?? []).map((e) => `Enviado: ${e}.`),
      ...(r.falhas ?? []),
      ...(r.ignorados ?? []).map((i) => `${i.documento}: ${i.motivo}`),
    ];
    return { ok: (r.enviados ?? []).length > 0, texto: partes.join(" ") || "Nada para reenviar." };
  }

  async function reenviar(
    ids: string[],
    canais: ("EMAIL" | "WHATSAPP")[],
    opcoes: { email?: string; recado?: string; chave: string },
  ) {
    setEnviando(opcoes.chave);
    try {
      const resposta = await fetch("/api/assinaturas/reenviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, canais, email: opcoes.email ?? null, recado: opcoes.recado ?? null }),
      });
      const det = await resposta.json().catch(() => ({ erro: "Não consegui falar com o servidor." }));
      return resumoDoReenvio(resposta.ok ? det : { erro: det?.erro ?? "Não deu certo." });
    } catch {
      return { ok: false, texto: "Não consegui falar com o servidor." };
    } finally {
      setEnviando(null);
    }
  }

  /** Pergunta ao provedor em que pe esta. */
  async function conferirEnvio(id: string) {
    setEnviando(id);
    setErro(null);
    try {
      const resposta = await fetch(`/api/assinaturas/${id}/conferir`, { method: "POST" });
      const det = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setErro(det?.erro ?? "não consegui conferir.");
        return;
      }
      setEnviados((atual) =>
        atual.map((e) => (e.id === id ? (det.envio as EnvioNaTela) : e)),
      );
    } finally {
      setEnviando(null);
    }
  }

  const quantosFormatos = FORMATOS.filter((f) => formatos.has(f.chave)).length;

  return (
    <section className="cartao mt-6">
      <h2 className="font-semibold">Gerar documentos</h2>
      <p className="mt-1 text-sm text-slate-600">
        Marque o que precisa. Sai no modelo do escritório, com os dados deste
        cliente e do contrato de honorários dele. Confira na tela antes de
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

      {quer("PROCURACAO") ? (
        <div className="mt-3 rounded border border-slate-200 p-3 text-sm">
          <p className="font-medium">Ações contratadas</p>
          <p className="ajuda">
            Uma procuração para cada ação: uma só, com as finalidades misturadas, atrapalha quando uma das ações termina ou é
            substabelecida. A lista fica no cadastro do cliente. Sem ação marcada, sai uma procuração com a descrição do contrato.
          </p>
          <ul className="mt-2 grid gap-1">
            {acoes.map((a) => (
              <li key={a} className="flex flex-wrap items-center gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={acoesAgora.has(a)}
                    onChange={() => {
                      const novo = new Set(acoesAgora);
                      if (novo.has(a)) novo.delete(a);
                      else novo.add(a);
                      setAcoesAgora(novo);
                    }}
                  />
                  <span className="break-words">{a}</span>
                </label>
                <button
                  type="button"
                  className="text-xs underline"
                  disabled={gravandoAcoes}
                  onClick={async () => {
                    const texto = window.prompt("Ação contratada", a)?.trim();
                    if (!texto || texto === a) return;
                    if (await gravarAcoes(acoes.map((x) => (x === a ? texto : x)))) {
                      const novo = new Set(acoesAgora);
                      if (novo.delete(a)) novo.add(texto);
                      setAcoesAgora(novo);
                    }
                  }}
                >
                  editar
                </button>
                <button
                  type="button"
                  className="text-xs text-red-700 underline"
                  disabled={gravandoAcoes}
                  onClick={async () => {
                    if (!window.confirm(`Tirar "${a}" das ações deste cliente?`)) return;
                    if (await gravarAcoes(acoes.filter((x) => x !== a))) {
                      const novo = new Set(acoesAgora);
                      novo.delete(a);
                      setAcoesAgora(novo);
                    }
                  }}
                >
                  remover
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-2 flex flex-wrap gap-2"
            onSubmit={async (ev) => {
              ev.preventDefault();
              const texto = novaAcao.trim();
              if (texto.length < 3 || acoes.includes(texto)) return;
              if (await gravarAcoes([...acoes, texto])) {
                setAcoesAgora(new Set([...acoesAgora, texto]));
                setNovaAcao("");
              }
            }}
          >
            <input
              className="campo min-w-0 flex-1"
              maxLength={300}
              placeholder="Ex.: ação revisional de contrato de financiamento rural"
              value={novaAcao}
              onChange={(ev) => setNovaAcao(ev.target.value)}
              aria-label="Nova ação contratada"
            />
            <button type="submit" className="botao-discreto" disabled={gravandoAcoes || novaAcao.trim().length < 3}>
              Incluir ação
            </button>
          </form>
          {escolhidas.filter((e) => e.especie === "PROCURACAO").length > 1 ? (
            <p className="mt-2 text-slate-700">
              Vão sair {escolhidas.filter((e) => e.especie === "PROCURACAO").length} procurações, uma por ação marcada.
            </p>
          ) : null}
        </div>
      ) : null}

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
          O .docx é o arquivo do escritório, inteiro: timbre, fonte e formatação
          como estão no modelo. O PDF e o mesmo texto, com os mesmos valores,
          desenhado pelo BirdJud em A4 — imagem do timbre e formatação própria
          do Word não atravessam. Para um PDF idêntico ao papel do escritório,
          baixe o .docx e exporte do Word.
        </p>
      </div>

      {advogados.length > 1 ? (
        <div className="mt-3 rounded border border-slate-200 p-3">
          <p className="text-sm font-medium">Quem assina</p>
          <p className="mt-1 text-xs text-slate-600">
            Sem marcar ninguém, saem todos — que é o certo na maioria das
            bancas. Marque quando a peça for só de alguns: uma procuração
            outorgando poderes a dez advogados quando dois vão atuar da poder a
            mais gente do que o cliente quis. A escolha fica guardada neste
            cliente para a próxima vez.
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
            Em branco, o recibo sai da última cobrança paga deste cliente. Dinheiro
            que entrou por fora do sistema precisa ser digitado: inventar o número
            de um recibo seria dar quitação de um valor que ninguém conferiu.
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
              placeholder="honorários da ação trabalhista"
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
          {notaFiscalLigada ? (
            <p className="text-sm sm:col-span-2">
              O cliente pediu nota fiscal?{" "}
              <a
                className="font-semibold text-marca underline"
                href={`/notas?${new URLSearchParams({
                  clienteId,
                  valor: recibo.valor,
                  descricao: recibo.referenteA ? `Honorários advocatícios — ${recibo.referenteA}` : "",
                }).toString()}`}
              >
                Preparar a nota fiscal deste recibo
              </a>
              <span className="text-slate-500"> — ela só é emitida depois que o titular do certificado assina.</span>
            </p>
          ) : null}
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
            fechar conferência
          </button>
        ) : null}
      </div>

      {erro ? <p className="aviso-erro mt-3">{erro}</p> : null}
      {aviso ? <p className="mt-3 text-sm text-emerald-700">{aviso}</p> : null}

      {conferidas.map((c) => (
        <div key={c.chave} className="mt-4 border-t border-slate-200 pt-4">
          <p className="text-sm font-medium">{c.rotulo}</p>
          <p className="text-xs text-slate-500">
            {c.doEscritorio
              ? "Modelo do escritório."
              : "Modelo que já vem no sistema — pode ser trocado em Modelos."}
            {c.paginas ? ` ${c.paginas} pagina${c.paginas === "1" ? "" : "s"}.` : ""}
          </p>

          {c.semValor.length > 0 ? (
            <p className="mt-1 text-xs text-amber-700">
              Sem valor no cadastro, e por isso marcado na peça: {c.semValor.join(", ")}.
            </p>
          ) : null}
          {c.desconhecidos.length > 0 ? (
            <p className="mt-1 text-xs text-amber-700">
              O modelo pede campos que o sistema não conhece:{" "}
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
            {whatsappLigado ? (
              <button
                type="button"
                disabled={enviando !== null || !telefoneDoCliente}
                className="botao-secundario disabled:opacity-50"
                title={
                  telefoneDoCliente
                    ? `Manda o PDF para ${telefoneDoCliente}`
                    : "O cliente está sem telefone no cadastro"
                }
                onClick={() => mandar(c, "WHATSAPP")}
              >
                {enviando === `zap:${c.chave}` ? "mandando..." : "Mandar no WhatsApp"}
              </button>
            ) : null}
            {emailLigado ? (
              <button
                type="button"
                disabled={enviando !== null || !emailDoCliente}
                className="botao-secundario disabled:opacity-50"
                title={
                  emailDoCliente
                    ? `Manda o PDF para ${emailDoCliente}`
                    : "O cliente está sem e-mail no cadastro"
                }
                onClick={() => mandar(c, "EMAIL")}
              >
                {enviando === `email:${c.chave}` ? "mandando..." : "Mandar por e-mail"}
              </button>
            ) : null}
            <a
              className="botao-discreto"
              href={c.url}
              target="_blank"
              rel="noreferrer"
            >
              abrir em outra aba
            </a>
          </div>

          {whatsappLigado ? (
            <p className="mt-1 text-xs text-slate-500">
              {telefoneDoCliente
                ? `Vai para ${telefoneDoCliente}, o telefone do cadastro — não há onde digitar outro, de propósito.`
                : "Sem telefone no cadastro, não dá para mandar: mandar documento de um cliente para o número de outro não se desfaz."}
            </p>
          ) : null}
          {emailLigado ? (
            <div className="mt-1 text-xs text-slate-500">
              <p>
                {emailDoCliente
                  ? `Por e-mail vai para ${emailDoCliente}, o e-mail do cadastro, sempre em PDF, pelo remetente do escritório.`
                  : "Sem e-mail no cadastro, não dá para mandar por e-mail."}
              </p>
              {emailDoCliente ? (
                <label className="mt-1 block">
                  Recado no e-mail (opcional)
                  <input
                    value={recado}
                    onChange={(e) => setRecado(e.target.value)}
                    maxLength={1000}
                    placeholder="Ex.: assine e devolva até sexta-feira."
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm text-slate-800"
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          {assinaturaLigada ? (
            <div className="mt-3 rounded border border-slate-200 p-3">
              <p className="text-sm font-medium">Mandar para assinatura</p>
              <p className="mt-1 text-xs text-slate-600">
                Sai pelo Autentique, com o plano do escritório. O e-mail para
                quem assina sai na hora e não dá para desfazer — e cada
                documento é cobrado do escritório. Vai este PDF, o mesmo que
                esta ai em cima.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="text-xs text-slate-600" htmlFor={`assina-${c.chave}`}>
                  Quem assina:
                </label>
                <select
                  id={`assina-${c.chave}`}
                  className="campo w-auto py-1 text-sm"
                  value={assinam[c.chave] ?? ASSINA_POR_PADRAO[c.especie as keyof typeof ASSINA_POR_PADRAO]}
                  onChange={(e) => setAssinam({ ...assinam, [c.chave]: e.target.value })}
                >
                  {QUEM_ASSINA.map((q) => (
                    <option key={q.chave} value={q.chave}>
                      {q.rotulo}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={enviando !== null}
                  className="botao-secundario disabled:opacity-50"
                  onClick={() => mandarAssinar(c)}
                >
                  {enviando === c.chave ? "mandando..." : "Enviar para assinatura"}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                O padrão de cada peça já vem escolhido: a procuração e a
                declaracao sao atos do cliente e so ele assina; o recibo e do
                escritorio, que e quem da quitacao; o contrato e dos dois.
              </p>
            </div>
          ) : null}
        </div>
      ))}

      {enviados.length > 0 ? (
        <div className="mt-6 border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold">Mandados para assinatura</h3>
          {enviados.some((e) => e.situacao === "ENVIADO" || e.situacao === "PARCIAL") ? (
            <details className="mt-2 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
              <summary className="cursor-pointer font-medium text-marca">Reenviar o que falta assinar</summary>
              <p className="ajuda">
                Cada pessoa recebe uma mensagem só, com todos os documentos que faltam ela assinar. Quem já assinou fica de fora.
              </p>
              <div className="mt-2 grid gap-1">
                {enviados
                  .filter((e) => e.situacao === "ENVIADO" || e.situacao === "PARCIAL")
                  .map((e) => (
                    <label key={e.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={lote.ids.has(e.id)}
                        onChange={(ev) => {
                          const ids = new Set(lote.ids);
                          if (ev.target.checked) ids.add(e.id);
                          else ids.delete(e.id);
                          setLote({ ...lote, ids });
                        }}
                      />
                      {ESPECIES.find((x) => x.chave === e.especie)?.rotulo ?? e.especie}
                      <span className="text-xs text-slate-500">{new Date(e.criadoEm).toLocaleDateString("pt-BR")}</span>
                    </label>
                  ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-4">
                {(
                  [
                    ["EMAIL", "E-mail", emailLigado],
                    ["WHATSAPP", "WhatsApp (só o cliente)", whatsappLigado],
                  ] as const
                ).map(([canal, rotulo, ligado]) => (
                  <label key={canal} className={`flex items-center gap-2 ${ligado ? "" : "text-slate-400"}`}>
                    <input
                      type="checkbox"
                      disabled={!ligado}
                      checked={lote.canais.has(canal)}
                      onChange={(ev) => {
                        const canais = new Set(lote.canais);
                        if (ev.target.checked) canais.add(canal);
                        else canais.delete(canal);
                        setLote({ ...lote, canais });
                      }}
                    />
                    {rotulo}
                  </label>
                ))}
              </div>
              <textarea
                className="campo mt-2 min-h-16"
                maxLength={1000}
                placeholder="Recado opcional (ex.: precisamos até sexta para protocolar)"
                value={lote.recado}
                onChange={(ev) => setLote({ ...lote, recado: ev.target.value })}
              />
              <button
                type="button"
                className="botao-principal mt-2"
                disabled={enviando !== null || lote.ids.size === 0 || lote.canais.size === 0}
                onClick={async () =>
                  setResultadoDoLote(await reenviar([...lote.ids], [...lote.canais], { recado: lote.recado, chave: "lote" }))
                }
              >
                {enviando === "lote" ? "Reenviando…" : "Reenviar"}
              </button>
              {resultadoDoLote ? (
                <p role="status" className={`mt-2 ${resultadoDoLote.ok ? "text-emerald-700" : "text-red-700"}`}>
                  {resultadoDoLote.texto}
                </p>
              ) : null}
            </details>
          ) : null}
          <ul className="mt-2 space-y-3">
            {enviados.map((e) => {
              const s = SITUACAO[e.situacao] ?? {
                rotulo: e.situacao,
                cor: "text-slate-600",
              };
              return (
                <li key={e.id} className="rounded border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {ESPECIES.find((x) => x.chave === e.especie)?.rotulo ?? e.especie}
                    </span>
                    <span className={`text-xs ${s.cor}`}>{s.rotulo}</span>
                    <span className="text-xs text-slate-500">
                      {new Date(e.criadoEm).toLocaleDateString("pt-BR")}
                    </span>
                    <button
                      type="button"
                      disabled={enviando !== null}
                      className="botao-discreto disabled:opacity-50"
                      onClick={() => conferirEnvio(e.id)}
                    >
                      {enviando === e.id ? "..." : "conferir"}
                    </button>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {e.signatarios.map((a) => (
                      <li key={a.email || a.nome}>
                        {a.nome} — {a.email}{" "}
                        {a.recusadoEm ? (
                          <span className="text-red-700">recusou</span>
                        ) : a.assinadoEm ? (
                          <span className="text-emerald-700">
                            assinou em {new Date(a.assinadoEm).toLocaleDateString("pt-BR")}
                          </span>
                        ) : (
                          <span className="text-slate-500">ainda não assinou</span>
                        )}
                        {a.link && !a.assinadoEm && !a.recusadoEm ? (
                          <a
                            className="ml-2 underline"
                            href={a.link}
                            target="_blank"
                            rel="noreferrer"
                          >
                            link de assinatura
                          </a>
                        ) : null}
                        {/* O reenvio consulta o Autentique na hora: nao depende do link guardado. */}
                        {!a.assinadoEm && !a.recusadoEm && (e.situacao === "ENVIADO" || e.situacao === "PARCIAL") ? (
                          <span className="ml-2 inline-flex gap-2">
                            {(
                              [
                                ["EMAIL", "reenviar por e-mail", emailLigado],
                                [
                                  "WHATSAPP",
                                  "por WhatsApp",
                                  whatsappLigado && !!emailDoCliente && emailDoCliente.trim().toLowerCase() === a.email.trim().toLowerCase(),
                                ],
                              ] as const
                            )
                              .filter(([, , ligado]) => ligado)
                              .map(([canal, rotulo]) => {
                                const chave = `${e.id}:${a.email}:${canal}`;
                                return (
                                  <button
                                    key={canal}
                                    type="button"
                                    className="underline disabled:opacity-50"
                                    disabled={enviando !== null}
                                    onClick={async () => {
                                      const r = await reenviar([e.id], [canal], { email: a.email, chave });
                                      setNaLinha((atual) => ({ ...atual, [`${e.id}:${a.email}`]: r }));
                                    }}
                                  >
                                    {enviando === chave ? "reenviando…" : rotulo}
                                  </button>
                                );
                              })}
                          </span>
                        ) : null}
                        {naLinha[`${e.id}:${a.email}`] ? (
                          <span
                            role="status"
                            className={`mt-0.5 block ${naLinha[`${e.id}:${a.email}`].ok ? "text-emerald-700" : "text-red-700"}`}
                          >
                            {naLinha[`${e.id}:${a.email}`].texto}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
