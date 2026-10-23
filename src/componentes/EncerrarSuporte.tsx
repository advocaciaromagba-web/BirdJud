"use client";

import { signOut } from "next-auth/react";

export function EncerrarSuporte() {
  return (
    <button
      type="button"
      className="rounded border border-amber-900 px-2 py-0.5 text-amber-950 hover:bg-amber-200"
      onClick={async () => {
        await fetch("/api/suporte/encerrar", { method: "POST" }).catch(() => {});
        await signOut({ callbackUrl: "/login" });
      }}
    >
      Encerrar acesso de suporte
    </button>
  );
}
