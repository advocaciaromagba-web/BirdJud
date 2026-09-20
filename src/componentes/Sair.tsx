"use client";

import { signOut } from "next-auth/react";

export function Sair() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="-my-1 py-2 text-neutral-500 underline hover:text-neutral-800"
    >
      Sair
    </button>
  );
}
