"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LeitorDeDocumentos } from "./LeitorDeDocumentos";
import type { Perfil } from "@/lib/leitura-documento";
import { consultarCep, estadoDepois, focar, mascararCep, type EstadoDoCep } from "./consultaDeCep";
import { RecadoDoCep } from "./RecadoDoCep";

export type Campo = {
  nome: string;
  rotulo: string;
  tipo?:
    | "text"
    | "email"
    | "password"
    | "date"
    | "datetime-local"
    | "select"
    | "textarea"
    // Cliente: escolhe um da base OU cadastra um novo ali mesmo. Existe
    // porque a primeira reuniao costuma ser com quem ainda nao e cliente, e
    // mandar a pessoa sair para cadastrar antes e o jeito certo de ela nao
    // cadastrar.
    | "cliente"
    // CEP: completo, busca o endereco e preenche os campos de `preenche`; o
    // cursor vai para `focoDepois` (o numero). E o primeiro campo do endereco.
    | "cep";
  obrigatorio?: boolean;
  preenche?: { logradouro?: string; bairro?: string; cidade?: string; uf?: string };
  focoDepois?: string;
  placeholder?: string;
  opcoes?: { valor: string; rotulo: string }[];
  ajuda?: string;
  /** Ocupa a linha inteira na grade de dois campos. */
  largo?: boolean;
};

/**
 * Formulario de criacao usado por clientes, processos, agenda e usuarios.
 *
 * Um so lugar para o tratamento de erro da API e para o recarregamento da
 * lista depois de gravar.
 *
 * Os campos sao controlados de proposito: e assim que a leitura de documento
 * consegue preencher a tela sem que a pessoa redigite. `leitura` liga o
 * leitor de documentos acima do formulario — a pagina so o passa quando o
 * escritorio tem o modulo IA contratado.
 */
/** Valor sentinela do seletor de cliente. */
export const NOVO_CLIENTE = "__novo__";

export function FormularioCriar({
  rota,
  campos,
  textoBotao = "Adicionar",
  recolhivel = false,
  textoAbrir,
  leitura,
  metodo = "POST",
  valoresIniciais,
  aoConcluir,
  aoCancelar,
}: {
  rota: string;
  campos: Campo[];
  textoBotao?: string;
  /** Guardado atras de um botao: a lista e que importa na tela, nao o formulario. */
  recolhivel?: boolean;
  textoAbrir?: string;
  /** Perfil de leitura de documento; ausente, o leitor nao aparece. */
  leitura?: Perfil;
  /** PATCH quando o formulario edita um registro que ja existe. */
  metodo?: "POST" | "PATCH";
  /** O que ja esta gravado, na edicao. */
  valoresIniciais?: Record<string, string>;
  /** Chamado depois de gravar, alem do refresh da pagina. */
  aoConcluir?: () => void;
  /** Quando existe, aparece um "Cancelar" mesmo sem `recolhivel`. */
  aoCancelar?: () => void;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  // Nome repetido nao barra: mostra quem ja existe e pede confirmacao. Ver
  // src/lib/duplicados.ts.
  const [confirmavel, setConfirmavel] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aberto, setAberto] = useState(!recolhivel);
  const [valores, setValores] = useState<Record<string, string>>(
    valoresIniciais ?? {},
  );
  const chaveDaCobranca = useRef<string | null>(null);

  function mudar(nome: string, valor: string) {
    setValores((atuais) => ({ ...atuais, [nome]: valor }));
  }

  const [estadoDoCep, setEstadoDoCep] = useState<EstadoDoCep>({ tipo: "parado" });

  async function mudarCep(campo: Campo, valor: string) {
    const mascarado = mascararCep(valor);
    mudar(campo.nome, mascarado);
    if (mascarado.replace(/\D/g, "").length !== 8) {
      setEstadoDoCep({ tipo: "parado" });
      return;
    }
    setEstadoDoCep({ tipo: "buscando" });
    const achado = await consultarCep(mascarado);
    setEstadoDoCep(estadoDepois(achado));
    if (!achado || !campo.preenche) return;
    const p = campo.preenche;
    setValores((atuais) => ({
      ...atuais,
      ...(p.logradouro ? { [p.logradouro]: achado.logradouro ?? (achado.geral ? "" : atuais[p.logradouro] ?? "") } : {}),
      ...(p.bairro ? { [p.bairro]: achado.bairro ?? (achado.geral ? "" : atuais[p.bairro] ?? "") } : {}),
      ...(p.cidade ? { [p.cidade]: achado.cidade } : {}),
      ...(p.uf ? { [p.uf]: achado.uf } : {}),
    }));
    const alvo = achado.geral ? p.logradouro : campo.focoDepois;
    if (alvo) focar(`campo-${alvo}`);
  }

  function preencher(novos: Record<string, string>) {
    const conhecidos = new Set(campos.map((campo) => campo.nome));
    setValores((atuais) => {
      const juntos = { ...atuais };
      for (const [nome, valor] of Object.entries(novos)) {
        if (conhecidos.has(nome) && valor) juntos[nome] = valor;
      }
      return juntos;
    });
  }

  async function enviar(
    evento: React.FormEvent<HTMLFormElement>,
    confirmando = false,
  ) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    if (!confirmando) setConfirmavel(null);

    const corpo: Record<string, unknown> = {};
    for (const campo of campos) {
      if (campo.tipo === "cliente") {
        const escolhido = (valores[campo.nome] ?? "").trim();
        if (escolhido === NOVO_CLIENTE) {
          const nome = (valores[`${campo.nome}__nome`] ?? "").trim();
          const documento = (valores[`${campo.nome}__documento`] ?? "").trim();
          const telefone = (valores[`${campo.nome}__telefone`] ?? "").trim();
          if (nome) {
            corpo.clienteNovo = {
              nome,
              ...(documento ? { documento } : {}),
              ...(telefone ? { telefone } : {}),
            };
          }
        } else if (escolhido) {
          corpo[campo.nome] = escolhido;
        }
        continue;
      }
      const valor = (valores[campo.nome] ?? "").trim();
      if (valor) corpo[campo.nome] = valor;
    }
    if (rota === "/api/cobrancas") {
      chaveDaCobranca.current ??= crypto.randomUUID();
      corpo.chaveOperacao = chaveDaCobranca.current;
    }
    if (confirmando) corpo.confirmarHomonimo = true;

    const resposta = await fetch(rota, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    setEnviando(false);

    if (resposta.ok) {
      chaveDaCobranca.current = null;
      setValores({});
      setConfirmavel(null);
      if (recolhivel) setAberto(false);
      router.refresh();
      aoConcluir?.();
      return;
    }
    const json = await resposta.json().catch(() => ({}));
    setErro(json.erro ?? "Nao foi possivel gravar.");
    // So da para confirmar o que o servidor disse que da: documento igual e a
    // mesma pessoa, e isso nao se confirma, se corrige.
    setConfirmavel(json.podeConfirmar ? (json.erro ?? "") : null);
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="botao-principal"
      >
        {textoAbrir ?? textoBotao}
      </button>
    );
  }

  return (
    <div className="cartao">
      {leitura ? (
        <div className="mb-5">
          <LeitorDeDocumentos perfil={leitura} aoAplicar={preencher} />
        </div>
      ) : null}

      <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
        {campos.map((campo) => (
          <div
            key={campo.nome}
            className={
              campo.largo || campo.tipo === "textarea" ? "sm:col-span-2" : ""
            }
          >
            <label htmlFor={`campo-${campo.nome}`} className="rotulo">
              {campo.rotulo}
              {campo.obrigatorio ? (
                <span className="text-slate-500"> *</span>
              ) : null}
            </label>
            {campo.tipo === "cliente" ? (
              <>
                <select
                  id={`campo-${campo.nome}`}
                  name={campo.nome}
                  required={campo.obrigatorio}
                  value={valores[campo.nome] ?? ""}
                  onChange={(evento) => mudar(campo.nome, evento.target.value)}
                  className="campo"
                >
                  <option value="">—</option>
                  {campo.opcoes?.map((opcao) => (
                    <option key={opcao.valor} value={opcao.valor}>
                      {opcao.rotulo}
                    </option>
                  ))}
                  <option value={NOVO_CLIENTE}>+ Cadastrar cliente novo</option>
                </select>

                {valores[campo.nome] === NOVO_CLIENTE ? (
                  <div className="mt-3 space-y-3 border-l-2 border-slate-200 pl-3">
                    <div>
                      <label
                        className="rotulo"
                        htmlFor={`campo-${campo.nome}-nome`}
                      >
                        Nome do cliente novo
                        <span className="text-slate-500"> *</span>
                      </label>
                      <input
                        id={`campo-${campo.nome}-nome`}
                        className="campo"
                        required
                        value={valores[`${campo.nome}__nome`] ?? ""}
                        onChange={(evento) =>
                          mudar(`${campo.nome}__nome`, evento.target.value)
                        }
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          className="rotulo"
                          htmlFor={`campo-${campo.nome}-documento`}
                        >
                          CPF ou CNPJ
                        </label>
                        <input
                          id={`campo-${campo.nome}-documento`}
                          className="campo"
                          value={valores[`${campo.nome}__documento`] ?? ""}
                          onChange={(evento) =>
                            mudar(
                              `${campo.nome}__documento`,
                              evento.target.value,
                            )
                          }
                        />
                      </div>
                      <div>
                        <label
                          className="rotulo"
                          htmlFor={`campo-${campo.nome}-telefone`}
                        >
                          Telefone
                        </label>
                        <input
                          id={`campo-${campo.nome}-telefone`}
                          className="campo"
                          value={valores[`${campo.nome}__telefone`] ?? ""}
                          onChange={(evento) =>
                            mudar(`${campo.nome}__telefone`, evento.target.value)
                          }
                        />
                      </div>
                    </div>
                    <p className="ajuda">
                      O cadastro completo pode ser feito depois, em Clientes.
                      Aqui basta o nome.
                    </p>
                  </div>
                ) : null}
              </>
            ) : campo.tipo === "select" ? (
              <select
                id={`campo-${campo.nome}`}
                name={campo.nome}
                required={campo.obrigatorio}
                value={valores[campo.nome] ?? ""}
                onChange={(evento) => mudar(campo.nome, evento.target.value)}
                className="campo"
              >
                <option value="">—</option>
                {campo.opcoes?.map((opcao) => (
                  <option key={opcao.valor} value={opcao.valor}>
                    {opcao.rotulo}
                  </option>
                ))}
              </select>
            ) : campo.tipo === "textarea" ? (
              <textarea
                id={`campo-${campo.nome}`}
                name={campo.nome}
                required={campo.obrigatorio}
                rows={4}
                value={valores[campo.nome] ?? ""}
                onChange={(evento) => mudar(campo.nome, evento.target.value)}
                className="campo"
              />
            ) : campo.tipo === "cep" ? (
              <>
                <input
                  id={`campo-${campo.nome}`}
                  name={campo.nome}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder={campo.placeholder ?? "00000-000"}
                  value={valores[campo.nome] ?? ""}
                  onChange={(evento) => void mudarCep(campo, evento.target.value)}
                  className="campo"
                />
                <RecadoDoCep estado={estadoDoCep} />
              </>
            ) : (
              <input
                id={`campo-${campo.nome}`}
                name={campo.nome}
                placeholder={campo.placeholder}
                type={campo.tipo ?? "text"}
                required={campo.obrigatorio}
                value={valores[campo.nome] ?? ""}
                onChange={(evento) => mudar(campo.nome, evento.target.value)}
                className="campo"
              />
            )}
            {campo.ajuda ? <p className="ajuda">{campo.ajuda}</p> : null}
          </div>
        ))}

        {erro ? <p className="aviso-erro sm:col-span-2">{erro}</p> : null}

        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="submit" disabled={enviando} className="botao-principal">
            {enviando ? "Gravando..." : textoBotao}
          </button>
          {confirmavel !== null ? (
            <button
              type="button"
              disabled={enviando}
              onClick={(e) =>
                enviar(e as unknown as React.FormEvent<HTMLFormElement>, true)
              }
              className="botao-secundario"
            >
              E outra pessoa, cadastrar assim mesmo
            </button>
          ) : null}
          {recolhivel || aoCancelar ? (
            <button
              type="button"
              onClick={() => {
                setAberto(false);
                aoCancelar?.();
              }}
              className="botao-secundario"
            >
              Cancelar
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
