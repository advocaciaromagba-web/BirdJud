"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type AreaNaTela = { chave: string; nome: string; permitido: boolean };

/**
 * O que este escritorio deixa esta pessoa ver.
 *
 * O que esta marcado aqui e o que vale AGORA, nao o que foi digitado: quase
 * tudo nasce aberto, o dinheiro nasce fechado, e nada precisa ter sido gravado
 * para ja estar valendo. Mostrar a caixa vazia ate alguem clicar faria o
 * escritorio achar que ninguem ve nada.
 */
export function AreasDoUsuario({
  usuarioId,
  nome,
  ehAdmin,
  ehVoce,
  areas,
}: {
  usuarioId: string;
  nome: string;
  ehAdmin: boolean;
  ehVoce: boolean;
  areas: AreaNaTela[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function mudar(area: string, permitido: boolean) {
    setOcupado(area);
    setErro(null);
    const resposta = await fetch(`/api/usuarios/${usuarioId}/permissoes`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ area, permitido }),
    });
    setOcupado(null);
    if (!resposta.ok) {
      const d = await resposta.json().catch(() => null);
      setErro(d?.erro ?? "Nao consegui gravar.");
      return;
    }
    router.refresh();
  }

  if (ehAdmin) {
    return (
      <p className="mt-1 text-xs text-slate-500">
        Administrador ve todas as areas. Quem administra precisa poder consertar
        o que quebrou em qualquer uma delas.
      </p>
    );
  }

  const abertas = areas.filter((a) => a.permitido).length;

  return (
    <div className="mt-1">
      <button type="button" onClick={() => setAberto((v) => !v)} className="botao-discreto">
        {aberto ? "fechar" : `areas: ${abertas} de ${areas.length}`}
      </button>

      {aberto ? (
        <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-3">
          {ehVoce ? (
            <p className="text-xs text-amber-700">
              Ninguem muda a propria permissao — senao este painel viraria o
              caminho para contornar este painel.
            </p>
          ) : null}
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {areas.map((a) => (
              <li key={a.chave}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={a.permitido}
                    disabled={ehVoce || ocupado === a.chave}
                    onChange={(e) => mudar(a.chave, e.target.checked)}
                  />
                  {a.nome}
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            Fechar uma area tira ela do menu E barra o endereco. {nome} vai ver
            uma tela dizendo qual area e quem libera.
          </p>
          {erro ? <p className="aviso-erro mt-2">{erro}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
