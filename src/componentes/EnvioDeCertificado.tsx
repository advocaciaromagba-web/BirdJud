"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CampoDeSenha } from "./CampoDeSenha";

/**
 * Envio do certificado A1 do escritorio.
 *
 * O arquivo vai como arquivo. A versao anterior pedia o .pfx "em base64", o
 * que na pratica deixava o campo inutilizavel: ninguem converte certificado a
 * mao. A conversao e nossa, do lado de ca.
 */
export function EnvioDeCertificado({
  jaEnviado,
  resumo,
}: {
  jaEnviado: boolean;
  resumo: string | null;
}) {
  const router = useRouter();
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setAviso(null);

    const arquivo = arquivoRef.current?.files?.[0];
    if (!arquivo) {
      setErro("Escolha o arquivo do certificado.");
      return;
    }

    const dados = new FormData();
    dados.append("arquivo", arquivo);
    dados.append("senha", senha);

    setEnviando(true);
    try {
      const resposta = await fetch("/api/administracao/certificado", {
        method: "POST",
        body: dados,
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(corpo.erro ?? "Nao foi possivel enviar o certificado.");
        return;
      }
      setAviso(corpo.detalhe ?? "Certificado enviado.");
      setSenha("");
      if (arquivoRef.current) arquivoRef.current.value = "";
      router.refresh();
    } catch {
      setErro("Falha de rede. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  async function remover() {
    setErro(null);
    setAviso(null);
    setEnviando(true);
    try {
      const resposta = await fetch("/api/administracao/certificado", {
        method: "DELETE",
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        setErro(corpo.erro ?? "Nao foi possivel remover.");
        return;
      }
      setAviso("Certificado removido. Sem ele nao ha emissao de nota.");
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="cartao">
      <p className="sobretitulo">Nota fiscal</p>
      <h2 className="mt-1 text-lg font-bold">Certificado digital A1</h2>

      <p className="mt-2 leitura text-slate-600">
        E com ele que a NFS-e e assinada. O arquivo termina em{" "}
        <code>.pfx</code> ou <code>.p12</code> e foi entregue pela
        certificadora. Ele e guardado cifrado e nunca sai daqui — a plataforma
        nao tem certificado proprio, porque assinar nota de escritorio com
        certificado nosso seria falsidade, nao conveniencia.
      </p>

      {jaEnviado && (
        <p className="mt-3 aviso-ok">
          {resumo ?? "Certificado cadastrado."}
        </p>
      )}

      <form onSubmit={enviar} className="mt-4 space-y-4">
        <div>
          <label className="rotulo" htmlFor="cert-arquivo">
            Arquivo do certificado
          </label>
          <input
            id="cert-arquivo"
            ref={arquivoRef}
            className="campo"
            type="file"
            accept=".pfx,.p12"
            required
          />
        </div>

        <div>
          <label className="rotulo" htmlFor="cert-senha">
            Senha do certificado
          </label>
          <CampoDeSenha
            id="cert-senha"
            className="campo"
            autoComplete="off"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
          <p className="mt-1 text-sm text-slate-500">
            A senha e conferida agora: o arquivo so e guardado se abrir e
            estiver dentro da validade.
          </p>
        </div>

        {erro && <p className="aviso-erro">{erro}</p>}
        {aviso && <p className="aviso-ok">{aviso}</p>}

        <div className="flex flex-wrap gap-3">
          <button className="botao-principal" type="submit" disabled={enviando}>
            {enviando ? "Conferindo..." : jaEnviado ? "Substituir" : "Enviar"}
          </button>
          {jaEnviado && (
            <button
              className="botao-perigo"
              type="button"
              onClick={remover}
              disabled={enviando}
            >
              Remover
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
