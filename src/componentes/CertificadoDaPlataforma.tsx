"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Envio do e-CNPJ A1 da Blackbird, aqui no console. O arquivo e a senha vao
 * uma vez; ficam cifrados no banco e a emissao automatica assina com eles.
 */
export function CertificadoDaPlataforma({
  atual,
  temEmissor,
}: {
  atual: { titular: string; validoAte: string } | null;
  temEmissor: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState<{ ok: boolean; texto: string } | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    setOcupado(true);
    setRecado(null);
    const r = await fetch("/api/plataforma/emissor/certificado", { method: "POST", body: dados });
    const json = (await r.json().catch(() => ({}))) as { erro?: string; titular?: string; validoAte?: string };
    setOcupado(false);
    if (!r.ok) {
      setRecado({ ok: false, texto: json.erro ?? "Não foi possível guardar o certificado." });
      return;
    }
    setRecado({ ok: true, texto: `Certificado guardado: ${json.titular}, válido até ${new Date(json.validoAte ?? "").toLocaleDateString("pt-BR")}.` });
    setAberto(false);
    router.refresh();
  }

  async function remover() {
    if (!window.confirm("Remover o certificado guardado? Sem ele a nota da mensalidade não sai.")) return;
    setOcupado(true);
    await fetch("/api/plataforma/emissor/certificado", { method: "DELETE" });
    setOcupado(false);
    setRecado({ ok: true, texto: "Certificado removido." });
    router.refresh();
  }

  return (
    <div className="mt-2 text-sm">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="botao-discreto" onClick={() => setAberto((v) => !v)} disabled={!temEmissor}>
          {aberto ? "Fechar" : atual ? "Trocar o certificado" : "Enviar o certificado A1"}
        </button>
        {atual ? (
          <button type="button" className="botao-discreto" onClick={remover} disabled={ocupado}>
            Remover
          </button>
        ) : null}
      </div>
      {!temEmissor ? <p className="ajuda">Cadastre o emissor abaixo antes de enviar o certificado.</p> : null}
      {aberto ? (
        <form onSubmit={enviar} className="cartao-aperto mt-2 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            Arquivo do certificado (.pfx ou .p12)
            <input type="file" name="arquivo" accept=".pfx,.p12" required className="text-sm" />
          </label>
          <label className="grid gap-1">
            Senha do certificado
            <input type="password" name="senha" required autoComplete="off" className="rounded border border-slate-300 px-3 py-2" />
          </label>
          <p className="ajuda sm:col-span-2">
            O arquivo é aberto agora com a senha e só é guardado se abrir, for o e-CNPJ do CNPJ cadastrado e
            estiver na validade. Fica cifrado no banco, com a senha, porque a emissão automática assina sem
            ninguém na tela.
          </p>
          <div>
            <button type="submit" className="botao-principal" disabled={ocupado}>
              {ocupado ? "Conferindo..." : "Guardar"}
            </button>
          </div>
        </form>
      ) : null}
      {recado ? (
        <p role="status" className={`mt-2 ${recado.ok ? "text-green-800" : "text-red-700"}`}>
          {recado.texto}
        </p>
      ) : null}
    </div>
  );
}
