"use client";

import { useEffect, useState, type FormEvent } from "react";
import { LEMBRANCA, enderecoDeEntrada, slugDigitado } from "@/lib/entrada";

/**
 * "Entrar no meu escritorio".
 *
 * POR QUE EXISTE: cada escritorio mora no proprio endereco
 * (<escritorio>.birdjud.com.br), e o site publico nao sabe de quem e o
 * visitante. Ate aqui, quem ja era cliente so encontrava o botao de CADASTRO:
 * para entrar precisava lembrar o endereco de cabeca ou procurar um e-mail
 * antigo.
 *
 * E CLIENTE porque faz duas coisas que so o navegador pode fazer: lembrar o
 * ultimo escritorio e mandar a pessoa para outro endereco. A validacao mora em
 * lib/entrada.ts, que e testada — inclusive contra mandar alguem para fora do
 * nosso dominio.
 *
 * NAO CONSULTA O SERVIDOR de proposito. Uma tela que respondesse "este
 * escritorio nao existe" viraria uma lista de clientes para quem quisesse
 * tentar nomes. Quem errar o endereco encontra a mesma pagina que encontraria
 * digitando errado na barra do navegador.
 */
export function FormularioEntrar({ dominio }: { dominio: string }) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [lembrado, setLembrado] = useState<string | null>(null);

  useEffect(() => {
    // Em aba anonima, ou com dados do site bloqueados, ler isto lanca. A
    // pagina tem de funcionar assim mesmo: o atalho e conveniencia, nao
    // caminho obrigatorio.
    try {
      const guardado = window.localStorage.getItem(LEMBRANCA);
      if (guardado && slugDigitado(guardado, dominio)) setLembrado(guardado);
    } catch {
      // sem lembranca, segue a vida
    }
  }, [dominio]);

  function ir(valor: string) {
    const endereco = enderecoDeEntrada(valor, dominio);
    if (!endereco) {
      setErro(
        "Nao reconheci esse endereco. Digite so o nome do seu escritorio, " +
          "como aparece antes de ." + dominio,
      );
      return;
    }
    try {
      window.localStorage.setItem(LEMBRANCA, slugDigitado(valor, dominio)!);
    } catch {
      // nao poder lembrar nao impede entrar
    }
    window.location.href = endereco;
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    ir(texto);
  }

  return (
    <div className="grid gap-6">
      {lembrado ? (
        <div className="cartao-aperto">
          <p className="text-sm text-slate-600">Da ultima vez voce entrou em</p>
          <button
            type="button"
            onClick={() => ir(lembrado)}
            className="botao-principal mt-2 w-full"
          >
            {lembrado}.{dominio}
          </button>
        </div>
      ) : null}

      <form onSubmit={enviar} className="grid gap-3">
        <label htmlFor="entrar-escritorio" className="rotulo">
          Endereco do seu escritorio
        </label>
        <div className="flex items-stretch rounded-[var(--raio)] border border-slate-300 bg-white focus-within:border-[color:var(--marca-primaria)]">
          <input
            id="entrar-escritorio"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setErro(null);
            }}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="advocaciaroma"
            className="min-h-11 w-full rounded-l-[var(--raio)] border-0 bg-transparent px-3 py-2 text-sm outline-none"
          />
          <span className="grid shrink-0 place-items-center px-3 text-sm text-slate-500">
            .{dominio}
          </span>
        </div>
        {erro ? <p className="aviso-erro">{erro}</p> : null}
        <button type="submit" className="botao-principal">
          Entrar
        </button>
      </form>

      <p className="text-sm text-slate-600">
        Nao lembra o endereco? Ele esta no convite que voce recebeu por e-mail,
        ou com o administrador do seu escritorio.
      </p>
    </div>
  );
}
