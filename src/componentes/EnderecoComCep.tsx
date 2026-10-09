"use client";

import { useState } from "react";
import { consultarCep, estadoDepois, focar, mascararCep, type EstadoDoCep } from "./consultaDeCep";
import { RecadoDoCep } from "./RecadoDoCep";

export type EnderecoNoFormulario = {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export const ENDERECO_VAZIO: EnderecoNoFormulario = {
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "",
};

/** Do que esta gravado (rua ou logradouro, CEP so com digitos) para o formulario. */
export function enderecoParaFormulario(e: unknown): EnderecoNoFormulario {
  const x = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
  const t = (k: string) => (typeof x[k] === "string" ? (x[k] as string) : "");
  return {
    cep: mascararCep(t("cep")),
    logradouro: t("logradouro") || t("rua"),
    numero: t("numero"),
    complemento: t("complemento"),
    bairro: t("bairro"),
    cidade: t("cidade"),
    uf: t("uf"),
  };
}

/**
 * Endereco com o CEP primeiro: completo o CEP, rua, bairro, cidade e UF se
 * preenchem e o cursor vai para o numero. Tudo continua editavel — o CEP
 * pode estar desatualizado, e a pessoa corrige.
 */
export function EnderecoComCep({
  prefixo,
  valor,
  aoMudar,
}: {
  /** Para os ids dos campos (dois enderecos na mesma tela nao colidem). */
  prefixo: string;
  valor: EnderecoNoFormulario;
  aoMudar: (novo: EnderecoNoFormulario) => void;
}) {
  const [estado, setEstado] = useState<EstadoDoCep>({ tipo: "parado" });
  const id = (c: string) => `${prefixo}-${c}`;

  async function mudarCep(texto: string) {
    const cep = mascararCep(texto);
    const base = { ...valor, cep };
    aoMudar(base);
    if (cep.replace(/\D/g, "").length !== 8) {
      setEstado({ tipo: "parado" });
      return;
    }
    setEstado({ tipo: "buscando" });
    const achado = await consultarCep(cep);
    setEstado(estadoDepois(achado));
    if (!achado) return;
    aoMudar({
      ...base,
      logradouro: achado.logradouro ?? (achado.geral ? "" : base.logradouro),
      bairro: achado.bairro ?? (achado.geral ? "" : base.bairro),
      cidade: achado.cidade,
      uf: achado.uf,
    });
    focar(id(achado.geral ? "logradouro" : "numero"));
  }

  // Seis colunas: cabe na coluna estreita da Administracao sem cortar a cidade.
  const campo = (
    c: keyof EnderecoNoFormulario,
    rotulo: string,
    largura: string,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div className={`min-w-0 ${largura}`}>
      <label className="rotulo" htmlFor={id(c)}>
        {rotulo}
      </label>
      <input
        id={id(c)}
        className="campo"
        value={valor[c]}
        onChange={(e) => aoMudar({ ...valor, [c]: c === "uf" ? e.target.value.toUpperCase().slice(0, 2) : e.target.value })}
        {...extra}
      />
    </div>
  );

  return (
    <div className="grid grid-cols-6 gap-3">
      <div className="col-span-6 min-w-0 sm:col-span-2">
        <label className="rotulo" htmlFor={id("cep")}>
          CEP
        </label>
        <input
          id={id("cep")}
          className="campo"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="00000-000"
          value={valor.cep}
          onChange={(e) => void mudarCep(e.target.value)}
        />
      </div>
      {campo("logradouro", "Rua / avenida", "col-span-4 sm:col-span-3", { autoComplete: "address-line1" })}
      {campo("numero", "Numero", "col-span-2 sm:col-span-1")}
      <div className="col-span-6 -mt-2">
        <RecadoDoCep estado={estado} />
      </div>
      {campo("complemento", "Complemento", "col-span-6 sm:col-span-2")}
      {campo("bairro", "Bairro", "col-span-6 sm:col-span-4")}
      {campo("cidade", "Cidade", "col-span-4 sm:col-span-5", { autoComplete: "address-level2" })}
      {campo("uf", "UF", "col-span-2 sm:col-span-1", { autoComplete: "address-level1", maxLength: 2 })}
    </div>
  );
}
