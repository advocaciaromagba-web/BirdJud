"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PLANO, PLANOS, contaDoPlano, modulosDoPlano, type Plano } from "@/lib/planos";
import { FAIXAS, LIMITES, type Faixa } from "@/lib/catalogo";
import { emReais } from "@/lib/dinheiro";
import { LeitorDeDocumentos } from "./LeitorDeDocumentos";

/** "Advocacia Silva & Souza" -> "advocacia-silva-souza" */
export function sugerirEndereco(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

/**
 * Implantar escritorio: o minimo para ele nascer funcionando. O resto (equipe,
 * OABs, integracoes) e feito na tela seguinte, passo a passo e testado.
 */
export function FormularioImplantar({ dominio, diasPadrao }: { dominio: string; diasPadrao: number }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [slugMexido, setSlugMexido] = useState(false);
  const [plano, setPlano] = useState<Plano>("COMPLETO");
  const [faixa, setFaixa] = useState<Faixa>("ATE_3");
  const [valor, setValor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const formulario = useRef<HTMLFormElement>(null);
  const [lidoPelaIA, setLidoPelaIA] = useState(false);

  // A leitura do cartao CNPJ preenche os campos do escritorio. Os campos sao
  // nao controlados (FormData no envio): escreve direto no elemento.
  function aplicarLeitura(c: Record<string, string>) {
    const f = formulario.current;
    if (!f) return;
    const por = (nomeDoCampo: string, valor: string | undefined) => {
      const el = f.elements.namedItem(nomeDoCampo);
      if (valor && el instanceof HTMLInputElement) el.value = valor;
    };
    por("razaoSocial", c.razaoSocial);
    por("cnpj", c.cnpj);
    por("telefoneAtendimento", c.telefone);
    por("cidade", c.cidade);
    por("cep", c.cep);
    por("logradouro", c.logradouro);
    por("numero", c.numero);
    por("complemento", c.complemento);
    por("bairro", c.bairro);
    por("uf", c.uf);
    if (c.razaoSocial && !nome.trim()) setNome(c.razaoSocial);
    setLidoPelaIA(true);
  }

  const tabela = useMemo(() => contaDoPlano(plano, faixa).totalCentavos, [plano, faixa]);
  const endereco = slugMexido ? slug : sugerirEndereco(nome);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    const f = new FormData(evento.currentTarget);
    const texto = (c: string) => String(f.get(c) ?? "").trim() || undefined;
    const valorDigitado = valor.trim()
      ? Math.round(Number(valor.replace(/\./g, "").replace(",", ".")) * 100)
      : undefined;
    if (valorDigitado !== undefined && (!Number.isFinite(valorDigitado) || valorDigitado < 0)) {
      setErro("Valor fechado invalido. Use o formato 279,00.");
      return;
    }
    setEnviando(true);
    const r = await fetch("/api/plataforma/escritorios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nome: nome.trim(),
        slug: endereco,
        modulos: modulosDoPlano(plano),
        faixa,
        diasDeTeste: Number(f.get("diasDeTeste") ?? diasPadrao),
        valorCentavos: valorDigitado,
        dados: {
          razaoSocial: texto("razaoSocial"),
          cnpj: texto("cnpj"),
          telefoneAtendimento: texto("telefoneAtendimento"),
          cidade: texto("cidade"),
          // A sede: vai na qualificacao das pecas e e obrigatoria na nota
          // fiscal da mensalidade (tomador com CNPJ precisa de endereco).
          sede: texto("cep") || texto("logradouro")
            ? {
                cep: texto("cep") ?? null,
                logradouro: texto("logradouro") ?? null,
                numero: texto("numero") ?? null,
                complemento: texto("complemento") ?? null,
                bairro: texto("bairro") ?? null,
                cidade: texto("cidade") ?? null,
                uf: texto("uf") ?? null,
              }
            : undefined,
        },
        administrador: {
          nome: texto("adminNome"),
          email: texto("adminEmail"),
          oab: texto("adminOab"),
          telefone: texto("adminTelefone"),
          recebeWhatsapp: f.get("adminWhatsapp") === "on",
        },
      }),
    });
    const json = await r.json().catch(() => ({}));
    setEnviando(false);
    if (!r.ok) {
      setErro(json.erro ?? "Nao foi possivel implantar.");
      return;
    }
    router.push(`/plataforma/${json.id}/implantacao`);
  }

  const campo = (nomeDoCampo: string, rotulo: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}, ajuda?: string) => (
    <label className="grid gap-1 text-sm">
      <span className="rotulo mb-0">{rotulo}</span>
      <input name={nomeDoCampo} className="campo" {...extra} />
      {ajuda ? <span className="ajuda mt-0">{ajuda}</span> : null}
    </label>
  );

  return (
    <form ref={formulario} onSubmit={enviar} className="mt-6 grid gap-6">
      <section className="cartao grid gap-4 sm:grid-cols-2">
        <h2 className="sm:col-span-2 text-lg font-bold">1. O escritorio</h2>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="rotulo mb-0">Nome do escritorio *</span>
          <input
            required
            minLength={2}
            className="campo"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Advocacia Silva & Souza"
          />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="rotulo mb-0">Endereco *</span>
          <div className="flex items-center gap-2">
            <input
              required
              className="campo"
              value={endereco}
              onChange={(e) => {
                setSlugMexido(true);
                setSlug(e.target.value.toLowerCase());
              }}
              pattern="[a-z0-9][a-z0-9\-]*[a-z0-9]"
              minLength={3}
              maxLength={40}
            />
            <span className="whitespace-nowrap text-sm text-slate-500">.{dominio}</span>
          </div>
          <span className="ajuda mt-0">Sai do nome sozinho. Letras minusculas, numeros e hifen.</span>
        </label>
        <div className="sm:col-span-2">
          <LeitorDeDocumentos perfil="FISCAL" aoAplicar={aplicarLeitura} rota="/api/plataforma/leitura" />
          {lidoPelaIA ? (
            <p className="mt-3 rounded-lg border-2 border-violet-300 bg-violet-50 p-3 text-sm font-semibold text-violet-900">
              Dados do cartao CNPJ lidos pela IA nos campos abaixo: confira antes de implantar.
            </p>
          ) : null}
        </div>
        {campo("razaoSocial", "Razao social")}
        {campo("cnpj", "CNPJ", { inputMode: "numeric" }, "Conferido no digito. Sem ele a fatura da assinatura nao sai.")}
        {campo("telefoneAtendimento", "Telefone de atendimento", {}, "Vai em toda mensagem que o cliente recebe.")}
        {campo("cep", "CEP da sede", { inputMode: "numeric" })}
        {campo("logradouro", "Rua da sede")}
        {campo("numero", "Numero")}
        {campo("complemento", "Complemento")}
        {campo("bairro", "Bairro")}
        {campo("cidade", "Cidade")}
        {campo("uf", "UF", { maxLength: 2 })}
      </section>

      <section className="cartao grid gap-4 sm:grid-cols-2">
        <h2 className="sm:col-span-2 text-lg font-bold">2. Plano e preco</h2>
        <label className="grid gap-1 text-sm">
          <span className="rotulo mb-0">Plano</span>
          <select className="campo" value={plano} onChange={(e) => setPlano(e.target.value as Plano)}>
            {PLANOS.map((p) => (
              <option key={p} value={p}>
                {PLANO[p].rotulo}
              </option>
            ))}
          </select>
          <span className="ajuda mt-0">{PLANO[plano].chamada}</span>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="rotulo mb-0">Faixa</span>
          <select className="campo" value={faixa} onChange={(e) => setFaixa(e.target.value as Faixa)}>
            {FAIXAS.map((f) => (
              <option key={f} value={f}>
                {LIMITES[f].rotulo} — ate {LIMITES[f].advogados} advogado(s)
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="rotulo mb-0">Valor fechado (R$ por mes)</span>
          <input
            className="campo"
            inputMode="decimal"
            placeholder={(tabela / 100).toFixed(2).replace(".", ",")}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
          <span className="ajuda mt-0">
            Tabela: <strong>{emReais(tabela)}</strong>. Em branco, vale a tabela. Fica gravado no contrato do escritorio.
          </span>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="rotulo mb-0">Dias de teste</span>
          <input name="diasDeTeste" type="number" min={0} max={90} defaultValue={diasPadrao} className="campo" />
          <span className="ajuda mt-0">Zero: a primeira fatura sai no proximo vencimento.</span>
        </label>
      </section>

      <section className="cartao grid gap-4 sm:grid-cols-2">
        <h2 className="sm:col-span-2 text-lg font-bold">3. Quem administra</h2>
        <p className="sm:col-span-2 text-sm text-slate-600">
          O administrador recebe o convite na entrega, escolhe a propria senha, aceita os termos e
          cria a senha de administracao. A plataforma nunca conhece nenhuma das duas.
        </p>
        {campo("adminNome", "Nome *", { required: true, minLength: 2 })}
        {campo("adminEmail", "E-mail *", { required: true, type: "email" })}
        {campo("adminOab", "OAB", { placeholder: "123456/SP" }, "Com a UF. Entra sozinha no monitoramento do DJEN.")}
        {campo("adminTelefone", "Celular", { placeholder: "(16) 99999-0000" })}
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input type="checkbox" name="adminWhatsapp" defaultChecked />
          Receber os avisos do escritorio pelo WhatsApp neste celular
        </label>
      </section>

      {erro ? <p className="aviso-erro">{erro}</p> : null}
      <div>
        <button type="submit" disabled={enviando} className="botao-principal">
          {enviando ? "Implantando..." : "Implantar e seguir para a configuracao"}
        </button>
      </div>
    </form>
  );
}
