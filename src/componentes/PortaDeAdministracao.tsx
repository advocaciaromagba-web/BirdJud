"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Tranca } from "@/lib/pagina";

/**
 * A porta das areas protegidas: pede a senha de administracao, ou pede para
 * defini-la quando o escritorio ainda nao tem uma.
 *
 * Esta tela nao e um erro. Quem chega aqui esta logado e e administrador — so
 * falta confirmar que e a pessoa mesma, agora. Por isso ela explica o motivo
 * em vez de mostrar um 403.
 */
export function PortaDeAdministracao({
  tranca,
  area,
  minutos = 30,
}: {
  tranca: Tranca;
  area: string;
  minutos?: number;
}) {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (tranca === "sem-permissao") {
    return (
      <div className="cartao mx-auto max-w-lg">
        <h1 className="text-xl font-bold">Area do administrador</h1>
        <p className="mt-3 leitura text-slate-600">
          {area} e area do administrador do escritorio. Seu usuario nao tem esse
          papel. Peca a quem administra o escritorio para liberar, ou para
          executar a acao por voce.
        </p>
      </div>
    );
  }

  const definindo = tranca === "sem-senha";

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    if (definindo && senha !== confirma) {
      setErro("As duas senhas nao sao iguais.");
      return;
    }

    setEnviando(true);
    try {
      const rota = definindo
        ? "/api/administracao/senha"
        : "/api/administracao/destravar";
      const corpo = definindo ? { nova: senha } : { senha };
      const resposta = await fetch(rota, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(dados.erro ?? "Nao foi possivel continuar.");
        return;
      }
      setSenha("");
      setConfirma("");
      router.refresh();
    } catch {
      setErro("Falha de rede. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="cartao mx-auto max-w-lg">
      <p className="sobretitulo">Area protegida</p>
      <h1 className="mt-1 text-xl font-bold">
        {definindo ? "Defina a senha de administracao" : area}
      </h1>

      <p className="mt-3 leitura text-slate-600">
        {definindo ? (
          <>
            Esta e a segunda senha do escritorio. Ela guarda o financeiro e as
            acoes que nao tem volta — apagar usuario, cadastrar certificado,
            assinar nota. Nao e a senha com que voce entra no sistema, e nao
            deve ser igual a ela.
          </>
        ) : (
          <>
            {area} pede a senha de administracao do escritorio. Depois de
            digitada, ela vale por {minutos} minutos e precisa ser digitada de
            novo — assim um computador deixado aberto nao entrega o financeiro.
          </>
        )}
      </p>

      <form onSubmit={enviar} className="mt-5 space-y-4">
        <div>
          <label className="rotulo" htmlFor="senha-adm">
            {definindo ? "Nova senha de administracao" : "Senha de administracao"}
          </label>
          <input
            id="senha-adm"
            className="campo"
            type="password"
            autoComplete={definindo ? "new-password" : "current-password"}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
          {definindo && (
            <p className="mt-1 text-sm text-slate-500">
              Ao menos 12 caracteres, misturando letras e numeros.
            </p>
          )}
        </div>

        {definindo && (
          <div>
            <label className="rotulo" htmlFor="confirma-adm">
              Repita a senha
            </label>
            <input
              id="confirma-adm"
              className="campo"
              type="password"
              autoComplete="new-password"
              value={confirma}
              onChange={(e) => setConfirma(e.target.value)}
              required
            />
          </div>
        )}

        {erro && <p className="aviso-erro">{erro}</p>}

        <button className="botao-principal" type="submit" disabled={enviando}>
          {enviando
            ? "Conferindo..."
            : definindo
              ? "Definir senha"
              : "Destravar"}
        </button>
      </form>
    </div>
  );
}
