"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

async function enviar(rota: string, corpo: Record<string, string>) {
  const resposta = await fetch(rota, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const json = await resposta.json().catch(() => ({}));
  return { ok: resposta.ok, json } as const;
}

function Aviso({ texto, erro }: { texto: string | null; erro: boolean }) {
  if (!texto) return null;
  return <p className={`text-sm ${erro ? "text-red-700" : "text-green-700"}`}>{texto}</p>;
}

export function PainelConta({ doisFatoresAtivo }: { doisFatoresAtivo: boolean }) {
  return (
    <div className="mt-8 grid gap-8">
      <TrocarSenha />
      <DoisFatores ativo={doisFatoresAtivo} />
    </div>
  );
}

function TrocarSenha() {
  const [recado, setRecado] = useState<{ texto: string; erro: boolean } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function trocar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const dados = new FormData(form);
    const nova = String(dados.get("novaSenha") ?? "");

    if (nova !== String(dados.get("confirmacao") ?? "")) {
      setRecado({ texto: "A confirmacao nao confere com a nova senha.", erro: true });
      return;
    }

    setEnviando(true);
    const { ok, json } = await enviar("/api/conta/senha", {
      senhaAtual: String(dados.get("senhaAtual") ?? ""),
      novaSenha: nova,
    });
    setEnviando(false);

    if (ok) {
      form.reset();
      setRecado({
        texto: "Senha trocada. Todas as sessoes foram encerradas — entrando de novo...",
        erro: false,
      });
      // A troca derruba tambem esta sessao: sem isso, a tela ficaria dando 401
      // em cada clique seguinte.
      setTimeout(() => signOut({ callbackUrl: "/login" }), 2_000);
    } else {
      setRecado({ texto: json.erro ?? "Nao foi possivel trocar a senha.", erro: true });
    }
  }

  return (
    <section className="rounded border border-neutral-200 p-4">
      <h2 className="font-semibold">Trocar senha</h2>
      <form onSubmit={trocar} className="mt-3 grid gap-3">
        <label className="grid gap-1 text-sm">
          Senha atual
          <input name="senhaAtual" type="password" required autoComplete="current-password"
            className="rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          Nova senha (minimo 10 caracteres)
          <input name="novaSenha" type="password" required minLength={10} autoComplete="new-password"
            className="rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          Repita a nova senha
          <input name="confirmacao" type="password" required minLength={10} autoComplete="new-password"
            className="rounded border border-neutral-300 px-3 py-2" />
        </label>
        <Aviso texto={recado?.texto ?? null} erro={recado?.erro ?? false} />
        <button type="submit" disabled={enviando}
          className="justify-self-start rounded bg-marca px-4 py-2 font-semibold text-white disabled:opacity-60">
          {enviando ? "Trocando..." : "Trocar senha"}
        </button>
      </form>
    </section>
  );
}

function DoisFatores({ ativo }: { ativo: boolean }) {
  const router = useRouter();
  const [preparo, setPreparo] = useState<{ segredo: string; qr: string } | null>(null);
  const [recado, setRecado] = useState<{ texto: string; erro: boolean } | null>(null);

  async function preparar() {
    setRecado(null);
    const resposta = await fetch("/api/conta/dois-fatores/preparar", { method: "POST" });
    const json = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      setRecado({ texto: json.erro ?? "Nao foi possivel comecar.", erro: true });
      return;
    }
    setPreparo({ segredo: json.segredo, qr: json.qr });
  }

  async function ativar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!preparo) return;
    const dados = new FormData(evento.currentTarget);
    const { ok, json } = await enviar("/api/conta/dois-fatores", {
      segredo: preparo.segredo,
      codigo: String(dados.get("codigo") ?? ""),
    });
    if (ok) {
      setPreparo(null);
      setRecado({ texto: "Segundo fator ativado.", erro: false });
      router.refresh();
    } else {
      setRecado({ texto: json.erro ?? "Codigo invalido.", erro: true });
    }
  }

  async function desativar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const dados = new FormData(form);
    const { ok, json } = await enviar("/api/conta/dois-fatores/desativar", {
      senha: String(dados.get("senha") ?? ""),
      codigo: String(dados.get("codigo") ?? ""),
    });
    if (ok) {
      form.reset();
      setRecado({ texto: "Segundo fator desativado.", erro: false });
      router.refresh();
    } else {
      setRecado({ texto: json.erro ?? "Nao foi possivel desativar.", erro: true });
    }
  }

  return (
    <section className="rounded border border-neutral-200 p-4">
      <h2 className="font-semibold">
        Segundo fator {ativo ? <span className="text-green-700">· ativo</span> : null}
      </h2>

      {ativo ? (
        <form onSubmit={desativar} className="mt-3 grid gap-3">
          <p className="text-sm text-neutral-600">
            Para desligar, confirme com a senha e um codigo do aplicativo.
          </p>
          <label className="grid gap-1 text-sm">
            Senha
            <input name="senha" type="password" required
              className="rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm">
            Codigo de 6 digitos
            <input name="codigo" inputMode="numeric" required
              className="rounded border border-neutral-300 px-3 py-2" />
          </label>
          <Aviso texto={recado?.texto ?? null} erro={recado?.erro ?? false} />
          <button type="submit"
            className="justify-self-start rounded border border-neutral-400 px-4 py-2 font-semibold">
            Desativar
          </button>
        </form>
      ) : preparo ? (
        <form onSubmit={ativar} className="mt-3 grid gap-3">
          <p className="text-sm text-neutral-600">
            Leia o codigo no aplicativo autenticador e digite os 6 digitos para confirmar.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preparo.qr} alt="QR Code do segundo fator" className="h-44 w-44" />
          <p className="text-xs text-neutral-500">
            Nao consegue ler? Use o codigo: <code>{preparo.segredo}</code>
          </p>
          <label className="grid gap-1 text-sm">
            Codigo de 6 digitos
            <input name="codigo" inputMode="numeric" required
              className="rounded border border-neutral-300 px-3 py-2" />
          </label>
          <Aviso texto={recado?.texto ?? null} erro={recado?.erro ?? false} />
          <button type="submit"
            className="justify-self-start rounded bg-marca px-4 py-2 font-semibold text-white">
            Confirmar e ativar
          </button>
        </form>
      ) : (
        <div className="mt-3 grid gap-3">
          <p className="text-sm text-neutral-600">
            Uma segunda confirmacao no login, por aplicativo autenticador.
          </p>
          <Aviso texto={recado?.texto ?? null} erro={recado?.erro ?? false} />
          <button type="button" onClick={preparar}
            className="justify-self-start rounded bg-marca px-4 py-2 font-semibold text-white">
            Ativar segundo fator
          </button>
        </div>
      )}
    </section>
  );
}
