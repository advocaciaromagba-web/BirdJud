"use client";

import { useId, useState, type ComponentPropsWithoutRef } from "react";

/**
 * Campo de senha com o olho para ver o que esta sendo digitado.
 *
 * POR QUE EXISTE UM COMPONENTE SO: ha quinze campos de senha no sistema —
 * login, cadastro, troca de senha, redefinicao, segundo fator, senha de
 * administracao, senha do certificado A1. Cada um com o seu proprio botao
 * seria um lugar diferente para errar o mesmo detalhe, e um deles acabaria
 * sem o olho.
 *
 * POR QUE O OLHO: senha longa digitada as cegas e errada em silencio, e o
 * sistema so responde "senha invalida" — que e a mesma resposta de senha
 * errada de verdade. Quem nao consegue conferir o que digitou tende a
 * escolher senha curta, ou a anotar. Ver o que se digita e uma defesa, nao
 * uma concessao.
 *
 * O padrao continua ESCONDIDO: quem precisa ver, pede.
 *
 * Aceita tudo que um <input> aceita e repassa (`...resto`), porque metade dos
 * formularios do sistema le o valor pelo `name` e a outra metade e controlada
 * por `value`/`onChange`. Um componente que servisse so a um dos dois jeitos
 * deixaria metade dos campos sem olho.
 */
type Props = Omit<ComponentPropsWithoutRef<"input">, "type">;

export function CampoDeSenha({ className, id, ...resto }: Props) {
  const [visivel, setVisivel] = useState(false);
  const gerado = useId();
  const idDoCampo = id ?? gerado;

  return (
    <div className="relative">
      <input
        {...resto}
        id={idDoCampo}
        type={visivel ? "text" : "password"}
        // O espaco a direita e para o texto nao passar por baixo do botao.
        className={`${className ?? "campo"} pr-12`}
      />
      <button
        type="button"
        onClick={() => setVisivel((estava) => !estava)}
        // Sem isto, um leitor de tela anuncia so "botao".
        aria-label={visivel ? "Ocultar a senha" : "Mostrar a senha"}
        aria-pressed={visivel}
        aria-controls={idDoCampo}
        title={visivel ? "Ocultar a senha" : "Mostrar a senha"}
        // h-11/w-11 e o alvo de toque minimo: no celular, botao menor que isso
        // erra o dedo e o campo perde o foco.
        className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-lg text-slate-500 transition hover:text-slate-800 focus-visible:text-slate-800"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="3.2" />
          {visivel ? <path d="m4 20 16-16" /> : null}
        </svg>
      </button>
    </div>
  );
}
