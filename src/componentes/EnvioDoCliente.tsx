"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * As duas chaves de envio automatico de um cliente. O administrador mexe;
 * os outros so veem como esta. Desligar nao apaga o telefone nem o e-mail:
 * para o que o sistema manda sozinho (aviso, lembrete, cobranca, recibo,
 * nota fiscal, documento).
 */
export function EnvioDoCliente({
  clienteId,
  notificarWhatsapp,
  notificarEmail,
  alteradoEm,
  alteradoPor,
  podeMexer,
  compacto = false,
}: {
  clienteId: string;
  notificarWhatsapp: boolean;
  notificarEmail: boolean;
  alteradoEm: string | null;
  alteradoPor: string | null;
  podeMexer: boolean;
  compacto?: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState<{ ok: boolean; texto: string } | null>(null);

  async function trocar(campo: "notificarWhatsapp" | "notificarEmail", valor: boolean) {
    if (!valor && !window.confirm(
      `Desligar o envio automático por ${campo === "notificarWhatsapp" ? "WhatsApp" : "e-mail"}? O cliente deixa de receber avisos de compromisso, lembretes, cobranças, recibos, notas e documentos por esse canal.`,
    )) return;
    setOcupado(true);
    setRecado(null);
    const r = await fetch(`/api/clientes/${clienteId}/envio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [campo]: valor }),
    });
    const json = (await r.json().catch(() => ({}))) as { erro?: string; mensagem?: string };
    setOcupado(false);
    setRecado({ ok: r.ok, texto: json.mensagem ?? json.erro ?? (r.ok ? "Feito." : "Não deu certo.") });
    if (r.ok) router.refresh();
  }

  const chave = (campo: "notificarWhatsapp" | "notificarEmail", ligado: boolean, rotulo: string) => (
    <label className={`flex items-center gap-2 ${ligado ? "" : "text-red-700"}`}>
      <input type="checkbox" checked={ligado} disabled={!podeMexer || ocupado} onChange={(e) => void trocar(campo, e.target.checked)} />
      {rotulo}: {ligado ? "ligado" : "desligado"}
    </label>
  );

  return (
    <div className={compacto ? "text-sm" : "cartao-aperto text-sm"}>
      {compacto ? null : <h2 className="font-semibold">Envio automático</h2>}
      {compacto ? null : (
        <p className="ajuda">
          Desligado, o sistema não manda nada ao cliente por aquele canal: avisos de compromisso, lembretes, cobranças,
          recibos, notas fiscais e documentos. O telefone e o e-mail continuam no cadastro, para ligar e escrever à mão.
          {podeMexer ? "" : " Só o administrador do escritório muda."}
        </p>
      )}
      <div className={`flex flex-wrap gap-x-5 gap-y-1 ${compacto ? "" : "mt-2"}`}>
        {chave("notificarWhatsapp", notificarWhatsapp, "WhatsApp")}
        {chave("notificarEmail", notificarEmail, "E-mail")}
      </div>
      {alteradoEm ? (
        <p className="mt-1 text-xs text-slate-500">
          Alterado por {alteradoPor ?? "—"} em {new Date(alteradoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.
        </p>
      ) : null}
      {recado ? <p className={`mt-1 ${recado.ok ? "text-green-700" : "text-red-700"}`}>{recado.texto}</p> : null}
    </div>
  );
}
