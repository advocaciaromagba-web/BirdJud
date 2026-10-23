"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { PROVEDOR_SUPORTE } from "@/lib/auth-comum";

/** Troca o link de uso unico por uma sessao de suporte e vai para o inicio. */
export function EntradaDeSuporte({ token }: { token: string }) {
  const [erro, setErro] = useState<string | null>(token ? null : "Link sem token.");
  const tentou = useRef(false);

  useEffect(() => {
    if (!token || tentou.current) return;
    tentou.current = true;
    // Tira o token da barra de endereco antes de qualquer outra coisa.
    window.history.replaceState(null, "", "/suporte/entrar");
    void signIn(PROVEDOR_SUPORTE, { token, redirect: false }).then((r) => {
      if (r?.ok) window.location.replace("/");
      else setErro("Este link já foi usado, venceu ou não é deste escritório. Gere outro no console.");
    });
  }, [token]);

  return erro ? <p className="aviso-erro mt-4">{erro}</p> : <p className="mt-4 text-slate-600">Abrindo o escritório…</p>;
}
