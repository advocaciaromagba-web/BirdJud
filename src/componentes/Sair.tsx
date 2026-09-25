"use client";

import { signOut } from "next-auth/react";

export function Sair() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="botao-secundario"
    >
      Sair
    </button>
  );
}
