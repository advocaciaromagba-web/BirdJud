"use client";

import { useMemo, useRef, useState } from "react";
import { EnderecoComCep, enderecoParaFormulario } from "./EnderecoComCep";
import { useRouter } from "next/navigation";
import {
  avisoSobreContraste,
  normalizarCor,
  paletaDe,
} from "@/lib/identidade";

/**
 * Identidade visual do escritorio.
 *
 * A previa e ao vivo e mostra os elementos reais — menu, botao, etiqueta —,
 * nao quadradinhos de cor. Quadradinho nao revela que o botao ficou ilegivel;
 * o botao revela.
 */
export function IdentidadeDoEscritorio({
  nome,
  corPrimariaAtual,
  corSecundariaAtual,
  telefoneAtual,
  cidadeAtual,
  cnpjAtual,
  logoUrlAtual,
  sedeAtual,
}: {
  nome: string;
  corPrimariaAtual: string;
  corSecundariaAtual: string;
  telefoneAtual: string | null;
  cidadeAtual: string | null;
  cnpjAtual: string | null;
  /** Endereco da sede, como esta gravado. */
  sedeAtual?: unknown;
  logoUrlAtual: string | null;
}) {
  const router = useRouter();
  const logoRef = useRef<HTMLInputElement>(null);
  const [primaria, setPrimaria] = useState(corPrimariaAtual);
  const [secundaria, setSecundaria] = useState(corSecundariaAtual);
  const [telefone, setTelefone] = useState(telefoneAtual ?? "");
  const [cidade, setCidade] = useState(cidadeAtual ?? "");
  const [cnpj, setCnpj] = useState(cnpjAtual ?? "");
  const [sede, setSede] = useState(() => enderecoParaFormulario(sedeAtual));
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Cor invalida no meio da digitacao nao pode quebrar a previa: cai na atual.
  const paleta = useMemo(() => {
    try {
      return paletaDe(
        normalizarCor(primaria) ?? corPrimariaAtual,
        normalizarCor(secundaria) ?? corSecundariaAtual,
      );
    } catch {
      return paletaDe(corPrimariaAtual, corSecundariaAtual);
    }
  }, [primaria, secundaria, corPrimariaAtual, corSecundariaAtual]);

  const avisoDeContraste = avisoSobreContraste(paleta.primaria);

  async function gravar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      const resposta = await fetch("/api/administracao/identidade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          corPrimaria: primaria,
          corSecundaria: secundaria,
          telefoneAtendimento: telefone,
          cidade,
          cnpj,
          sede,
        }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(corpo.erro ?? "Nao foi possivel gravar.");
        return;
      }
      setAviso("Identidade gravada. Ela vale em todas as telas do escritorio.");
      router.refresh();
    } finally {
      setOcupado(false);
    }
  }

  async function enviarLogo() {
    const arquivo = logoRef.current?.files?.[0];
    if (!arquivo) {
      setErro("Escolha a imagem do logotipo.");
      return;
    }
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      const dados = new FormData();
      dados.append("logo", arquivo);
      const resposta = await fetch("/api/administracao/identidade", {
        method: "PUT",
        body: dados,
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(corpo.erro ?? "Nao foi possivel enviar o logotipo.");
        return;
      }
      if (logoRef.current) logoRef.current.value = "";
      setAviso("Logotipo enviado.");
      router.refresh();
    } finally {
      setOcupado(false);
    }
  }

  async function removerLogo() {
    setOcupado(true);
    try {
      await fetch("/api/administracao/identidade", { method: "DELETE" });
      setAviso("Logotipo removido. O sistema volta a mostrar o nome.");
      router.refresh();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="cartao">
      <p className="sobretitulo">Marca</p>
      <h2 className="mt-1 text-lg font-bold">Identidade do escritorio</h2>
      <p className="mt-2 leitura text-slate-600">
        O sistema e do escritorio, nao da plataforma: quem entra em{" "}
        <code>{nome}</code> ve a marca dele. Escolha duas cores — o resto da
        paleta e derivado delas, para que os contrastes fechem e nada fique
        ilegivel.
      </p>

      <form onSubmit={gravar} className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="rotulo" htmlFor="cor-primaria">
              Cor principal
            </label>
            <div className="flex items-center gap-3">
              <input
                id="cor-primaria"
                type="color"
                className="h-11 w-14 cursor-pointer rounded border border-slate-300"
                value={normalizarCor(primaria) ?? "#0B1F3B"}
                onChange={(e) => setPrimaria(e.target.value)}
              />
              <input
                className="campo font-mono"
                value={primaria}
                onChange={(e) => setPrimaria(e.target.value)}
                aria-label="Cor principal em hexadecimal"
              />
            </div>
            <p className="ajuda">Menu, botoes e titulos.</p>
          </div>

          <div>
            <label className="rotulo" htmlFor="cor-secundaria">
              Cor de destaque
            </label>
            <div className="flex items-center gap-3">
              <input
                id="cor-secundaria"
                type="color"
                className="h-11 w-14 cursor-pointer rounded border border-slate-300"
                value={normalizarCor(secundaria) ?? "#D4AF7C"}
                onChange={(e) => setSecundaria(e.target.value)}
              />
              <input
                className="campo font-mono"
                value={secundaria}
                onChange={(e) => setSecundaria(e.target.value)}
                aria-label="Cor de destaque em hexadecimal"
              />
            </div>
            <p className="ajuda">Reguas, filetes e detalhes.</p>
          </div>

          <div>
            <label className="rotulo" htmlFor="ident-cnpj">
              CNPJ do escritorio
            </label>
            <input
              id="ident-cnpj"
              className="campo"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              placeholder="00.000.000/0001-00"
            />
            <p className="ajuda">
              Usado na cobranca da assinatura. Sem ele, a fatura mensal nao
              pode ser emitida.
            </p>
          </div>

          {avisoDeContraste && (
            <p className="aviso-atencao">{avisoDeContraste}</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="rotulo" htmlFor="ident-telefone">
                Telefone de atendimento
              </label>
              <input
                id="ident-telefone"
                className="campo"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
              />
            </div>
            <div>
              <label className="rotulo" htmlFor="ident-cidade">
                Cidade
              </label>
              <input
                id="ident-cidade"
                className="campo"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-2">
            <p className="rotulo">Endereco da sede</p>
            <p className="ajuda mb-2 mt-0">
              Entra na qualificacao do escritorio nas pecas. Comece pelo CEP: o
              resto se preenche, falta so o numero.
            </p>
            <EnderecoComCep prefixo="sede" valor={sede} aoMudar={setSede} />
          </div>
        </div>

        {/* A previa mostra os elementos de verdade: quadradinho de cor nao
            revela que o botao ficou ilegivel. */}
        <div
          className="rounded-xl border border-slate-200 p-4"
          style={
            {
              "--previa-primaria": paleta.primaria,
              "--previa-secundaria": paleta.secundaria,
              "--previa-contraste": paleta.sobrePrimaria,
              "--previa-clara": paleta.primariaClara,
              "--previa-suave": paleta.primariaSuave,
            } as React.CSSProperties
          }
        >
          <p className="sobretitulo">Como vai ficar</p>
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <div
              className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold"
              style={{
                backgroundColor: "var(--previa-primaria)",
                color: "var(--previa-contraste)",
              }}
            >
              {logoUrlAtual ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrlAtual} alt="" className="h-5 w-auto" />
              ) : null}
              {nome}
            </div>
            <div
              className="space-y-3 p-3"
              style={{ backgroundColor: "var(--previa-clara)" }}
            >
              <p
                className="border-l-[3px] pl-2 text-sm font-semibold"
                style={{ borderColor: "var(--previa-secundaria)" }}
              >
                Audiencia de instrucao
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-medium"
                  style={{
                    backgroundColor: "var(--previa-primaria)",
                    color: "var(--previa-contraste)",
                  }}
                >
                  Agendar
                </span>
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: "var(--previa-suave)",
                    color: "var(--previa-primaria)",
                  }}
                >
                  prazo hoje
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <label className="rotulo" htmlFor="ident-logo">
              Logotipo
            </label>
            <input
              id="ident-logo"
              ref={logoRef}
              type="file"
              className="campo"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
            />
            <p className="ajuda">
              PNG, JPG, WEBP ou SVG, ate 1 MB. Fundo transparente fica melhor
              sobre a cor principal.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                className="botao-secundario"
                onClick={enviarLogo}
                disabled={ocupado}
              >
                Enviar logotipo
              </button>
              {logoUrlAtual && (
                <button
                  type="button"
                  className="botao-perigo"
                  onClick={removerLogo}
                  disabled={ocupado}
                >
                  Remover
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {erro && <p className="aviso-erro">{erro}</p>}
          {aviso && <p className="aviso-ok">{aviso}</p>}
          <button className="botao-principal mt-3" type="submit" disabled={ocupado}>
            {ocupado ? "Gravando..." : "Gravar identidade"}
          </button>
        </div>
      </form>
    </section>
  );
}
