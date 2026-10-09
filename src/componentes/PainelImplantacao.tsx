"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Passo } from "@/lib/primeiros-passos";
import { BarraDeProgresso } from "./RoteiroDePrimeirosPassos";
import { EnderecoComCep, enderecoParaFormulario } from "./EnderecoComCep";

type Campo = { nome: string; rotulo: string; tipo: "text" | "password" | "textarea"; obrigatorio: boolean; ajuda?: string };

export type DadosDaImplantacao = {
  id: string;
  nome: string;
  endereco: string;
  status: string;
  implantadoEm: string | null;
  entregueEm: string | null;
  temDjen: boolean;
  temNuvem: boolean;
  aceitePendente: boolean;
  escritorio: {
    razaoSocial: string;
    cnpj: string;
    telefoneAtendimento: string;
    cidade: string;
    corPrimaria: string;
    corSecundaria: string;
    /** Endereco da sede, como esta gravado. */
    sede: unknown;
  };
  pessoas: {
    id: string;
    nome: string;
    email: string;
    papel: string;
    oab: string | null;
    telefone: string | null;
    recebeWhatsapp: boolean;
    ativo: boolean;
    situacao: "ENTROU" | "CONVIDADO" | "CONVITE_VENCIDO" | "AGUARDANDO";
    conviteEm: string | null;
  }[];
  oabs: { id: string; numero: string; uf: string; nomeAdvogado: string | null }[];
  integracoes: {
    tipo: string;
    rotulo: string;
    descricao: string;
    campos: Campo[];
    oauth: boolean;
    status: string | null;
    erro: string | null;
    verificadoEm: string | null;
  }[];
  roteiro: { passos: Passo[]; feitos: number; total: number; porcento: number };
  fases: { chave: string; titulo: string }[];
};

type Convite = { email: string; enviado: boolean; link: string | null; motivo: string | null };

const quando = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

const SITUACAO_DA_PESSOA: Record<DadosDaImplantacao["pessoas"][number]["situacao"], { texto: string; classe: string }> = {
  ENTROU: { texto: "ja entrou", classe: "etiqueta-ok" },
  CONVIDADO: { texto: "convite enviado", classe: "etiqueta-marca" },
  CONVITE_VENCIDO: { texto: "convite vencido", classe: "etiqueta-erro" },
  AGUARDANDO: { texto: "recebe na entrega", classe: "etiqueta-neutra" },
};

const SELO_DO_PASSO: Record<Passo["situacao"], { texto: string; classe: string }> = {
  FEITO: { texto: "feito", classe: "etiqueta-ok" },
  PENDENTE: { texto: "a fazer", classe: "etiqueta-atencao" },
  PULADO: { texto: "depois", classe: "etiqueta-neutra" },
  INDISPONIVEL: { texto: "em breve", classe: "etiqueta-neutra" },
};

/** Passos que so o escritorio pode fazer — a plataforma nao faz por ele. */
const SO_DO_ESCRITORIO = new Set(["SENHA_ADMIN", "NUVEM", "WHATSAPP", "PRIMEIRO_CLIENTE", "PRIMEIRO_PROCESSO", "PRIMEIRO_COMPROMISSO", "MODELOS"]);

function Secao({ numero, titulo, resumo, children }: { numero: number; titulo: string; resumo: string; children: React.ReactNode }) {
  return (
    <section className="cartao">
      <h2 className="text-lg font-bold">
        <span className="mr-2 text-slate-400">{numero}.</span>
        {titulo}
      </h2>
      <p className="mt-1 text-sm text-slate-600">{resumo}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function PainelImplantacao({ dados }: { dados: DadosDaImplantacao }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recado, setRecado] = useState<{ onde: string; texto: string; ok: boolean } | null>(null);
  const [convites, setConvites] = useState<Convite[] | null>(null);
  const [sede, setSede] = useState(() => enderecoParaFormulario(dados.escritorio.sede));

  async function agir(onde: string, corpo: Record<string, unknown>, form?: HTMLFormElement) {
    setOcupado(onde);
    setRecado(null);
    const r = await fetch(`/api/plataforma/escritorios/${dados.id}/implantacao`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const json = await r.json().catch(() => ({}));
    setOcupado(null);
    if (!r.ok) {
      setRecado({ onde, texto: json.erro ?? "Nao deu certo.", ok: false });
      return null;
    }
    if (json.detalhe) setRecado({ onde, texto: json.detalhe, ok: json.ok !== false });
    if (json.convites) setConvites(json.convites);
    if (form && json.ok !== false) form.reset();
    router.refresh();
    return json;
  }

  const Recado = ({ onde }: { onde: string }) =>
    recado?.onde === onde ? (
      <p className={`mt-3 ${recado.ok ? "aviso-ok" : "aviso-erro"}`}>{recado.texto}</p>
    ) : null;

  const valores = (form: HTMLFormElement) =>
    Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, String(v).trim()]));

  const pendentesDaPlataforma = dados.roteiro.passos.filter(
    (p) => p.situacao === "PENDENTE" && !SO_DO_ESCRITORIO.has(p.chave),
  );

  return (
    <div className="mt-4 grid gap-6">
      <div>
        <p className="sobretitulo">Implantacao</p>
        <h1 className="mt-1">{dados.nome}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {dados.endereco} · {dados.status.toLowerCase()}
          {dados.implantadoEm ? ` · implantado em ${quando.format(new Date(dados.implantadoEm))}` : " · cadastrado pelo proprio escritorio"}
          {dados.entregueEm ? ` · entregue em ${quando.format(new Date(dados.entregueEm))}` : ""}
        </p>
        <div className="mt-4 max-w-xl">
          <BarraDeProgresso
            porcento={dados.roteiro.porcento}
            rotulo={`${dados.roteiro.feitos} de ${dados.roteiro.total} passos do roteiro do escritorio`}
          />
        </div>
      </div>

      <Secao numero={1} titulo="Dados do escritorio" resumo="CNPJ para a fatura da assinatura; endereco da sede para as pecas; telefone que vai em toda mensagem ao cliente; as cores do sistema.">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const temSede = Object.values(sede).some((v) => v.trim());
            agir("dados", { acao: "dados", ...valores(e.currentTarget), ...(temSede ? { sede } : {}) });
          }}
        >
          {(
            [
              ["razaoSocial", "Razao social"],
              ["cnpj", "CNPJ"],
              ["telefoneAtendimento", "Telefone de atendimento"],
            ] as const
          ).map(([nome, rotulo]) => (
            <label key={nome} className="grid gap-1 text-sm">
              <span className="rotulo mb-0">{rotulo}</span>
              <input name={nome} defaultValue={dados.escritorio[nome]} className="campo" />
            </label>
          ))}
          <div className="sm:col-span-2">
            <p className="rotulo">Endereco da sede</p>
            <p className="mb-2 text-xs text-slate-500">Comece pelo CEP: rua, bairro e cidade vem sozinhos, falta so o numero.</p>
            <EnderecoComCep prefixo="sede" valor={sede} aoMudar={setSede} />
          </div>
          <label className="grid gap-1 text-sm">
            <span className="rotulo mb-0">Cor principal</span>
            <input name="corPrimaria" type="color" defaultValue={dados.escritorio.corPrimaria} className="h-10 w-20 rounded border border-slate-300" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="rotulo mb-0">Cor de destaque</span>
            <input name="corSecundaria" type="color" defaultValue={dados.escritorio.corSecundaria} className="h-10 w-20 rounded border border-slate-300" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={ocupado === "dados"} className="botao-principal">
              {ocupado === "dados" ? "Gravando..." : "Gravar dados"}
            </button>
            <span className="ml-3 text-xs text-slate-500">O logotipo o escritorio envia em Configuracoes.</span>
          </div>
        </form>
        <Recado onde="dados" />
      </Secao>

      <Secao numero={2} titulo="Equipe" resumo="Cada pessoa recebe o proprio convite na entrega e escolhe a propria senha. Advogado com OAB entra sozinho no monitoramento do DJEN.">
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Papel</th>
                <th>OAB</th>
                <th>WhatsApp</th>
                <th>Acesso</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dados.pessoas.map((p) => {
                const s = SITUACAO_DA_PESSOA[p.situacao];
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="font-medium text-slate-900">{p.nome}</div>
                      <div className="text-xs text-slate-500">{p.email}</div>
                    </td>
                    <td>{p.papel === "ADMIN" ? "Administrador" : p.papel === "ADVOGADO" ? "Advogado" : "Apoio"}</td>
                    <td>{p.oab ?? "—"}</td>
                    <td>{p.recebeWhatsapp && p.telefone ? p.telefone : "—"}</td>
                    <td>
                      <span className={s.classe}>{s.texto}</span>
                      {p.conviteEm && p.situacao !== "ENTROU" ? (
                        <div className="text-xs text-slate-500">em {quando.format(new Date(p.conviteEm))}</div>
                      ) : null}
                    </td>
                    <td className="text-right">
                      {p.situacao !== "ENTROU" && p.situacao !== "AGUARDANDO" ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-[color:var(--marca-primaria)] hover:underline"
                          disabled={ocupado === `convite-${p.id}`}
                          onClick={() => agir(`convite-${p.id}`, { acao: "convite", usuarioId: p.id })}
                        >
                          Reenviar convite
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <form
          className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            const v = valores(e.currentTarget);
            agir(
              "pessoa",
              {
                acao: "pessoa",
                nome: v.nome,
                email: v.email,
                papel: v.papel,
                oab: v.oab || undefined,
                telefone: v.telefone || undefined,
                recebeWhatsapp: v.recebeWhatsapp === "on",
              },
              e.currentTarget,
            );
          }}
        >
          <input name="nome" required minLength={2} placeholder="Nome" className="campo" />
          <input name="email" required type="email" placeholder="E-mail" className="campo" />
          <select name="papel" className="campo" defaultValue="ADVOGADO">
            <option value="ADVOGADO">Advogado</option>
            <option value="USUARIO">Apoio</option>
            <option value="ADMIN">Administrador</option>
          </select>
          <input name="oab" placeholder="OAB (123456/SP)" className="campo" />
          <input name="telefone" placeholder="Celular" className="campo" />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="recebeWhatsapp" defaultChecked />
            Avisos pelo WhatsApp
          </label>
          <div className="sm:col-span-3">
            <button type="submit" disabled={ocupado === "pessoa"} className="botao-secundario">
              {ocupado === "pessoa" ? "Incluindo..." : "Incluir na equipe"}
            </button>
          </div>
        </form>
        <Recado onde="pessoa" />
        {recado?.onde.startsWith("convite-") ? <Recado onde={recado.onde} /> : null}
      </Secao>

      {dados.temDjen ? (
        <Secao numero={3} titulo="OABs no Diario de Justica" resumo="De cada OAB daqui sai a captura de publicacoes da madrugada. A do advogado cadastrado com OAB ja entra sozinha.">
          {dados.oabs.length ? (
            <ul className="mb-3 flex flex-wrap gap-2">
              {dados.oabs.map((o) => (
                <li key={o.id} className="etiqueta-marca">
                  {o.numero}/{o.uf}
                  {o.nomeAdvogado ? ` · ${o.nomeAdvogado}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-slate-500">Nenhuma OAB monitorada ainda.</p>
          )}
          <form
            className="grid gap-2 sm:grid-cols-[9rem_5rem_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              const v = valores(e.currentTarget);
              agir("oab", { acao: "oab", numero: v.numero, uf: v.uf.toUpperCase(), nomeAdvogado: v.nomeAdvogado || undefined }, e.currentTarget);
            }}
          >
            <input name="numero" required placeholder="Numero" className="campo" />
            <input name="uf" required maxLength={2} placeholder="UF" className="campo uppercase" />
            <input name="nomeAdvogado" placeholder="Nome do advogado (opcional)" className="campo" />
            <button type="submit" disabled={ocupado === "oab"} className="botao-secundario">
              Monitorar
            </button>
          </form>
          <Recado onde="oab" />
        </Secao>
      ) : null}

      <Secao numero={dados.temDjen ? 4 : 3} titulo="Integracoes" resumo="Cada credencial e testada no servico de verdade antes de ser guardada. O que falhar fica marcado, com o motivo, para corrigir aqui mesmo.">
        <div className="grid gap-3">
          {dados.integracoes.map((i) => (
            <Integracao key={i.tipo} i={i} ocupado={ocupado} agir={agir} Recado={Recado} />
          ))}
        </div>
      </Secao>

      <Secao numero={dados.temDjen ? 5 : 4} titulo="Clientes do sistema anterior" resumo="A planilha exportada do sistema que o escritorio usava (Excel ou CSV). Confere linha a linha antes de gravar, e o lote pode ser desfeito.">
        <a href={`/plataforma/${dados.id}/importar`} className="botao-secundario">
          Importar clientes por planilha
        </a>
      </Secao>

      <Secao numero={dados.temDjen ? 6 : 5} titulo="O roteiro do escritorio" resumo="O mesmo que o escritorio ve em Primeiros passos, medido do mesmo jeito. Os marcados como 'do escritorio' so ele pode fazer.">
        <ol className="grid gap-1">
          {dados.roteiro.passos.map((p) => {
            const selo = SELO_DO_PASSO[p.situacao];
            return (
              <li key={p.chave} className="flex flex-wrap items-center gap-2 border-b border-slate-100 py-2 text-sm last:border-0">
                <span className={selo.classe}>{selo.texto}</span>
                <span className="flex-1 font-medium text-slate-800">{p.titulo}</span>
                {SO_DO_ESCRITORIO.has(p.chave) && p.situacao !== "FEITO" ? (
                  <span className="text-xs text-slate-500">do escritorio</span>
                ) : null}
                {p.situacao === "PENDENTE" && !p.essencial && !SO_DO_ESCRITORIO.has(p.chave) ? (
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:underline"
                    onClick={() => agir(`passo-${p.chave}`, { acao: "pular", chave: p.chave })}
                  >
                    nao vai usar
                  </button>
                ) : null}
                {p.situacao === "PULADO" ? (
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:underline"
                    onClick={() => agir(`passo-${p.chave}`, { acao: "retomar", chave: p.chave })}
                  >
                    voltar ao roteiro
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
      </Secao>

      <Secao numero={dados.temDjen ? 7 : 6} titulo="Entrega" resumo="Manda o convite a quem ainda nao entrou. Pode repetir: reenviar invalida o link anterior da pessoa.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Falta da plataforma</p>
            {pendentesDaPlataforma.length ? (
              <ul className="mt-2 list-disc pl-5 text-sm text-amber-800">
                {pendentesDaPlataforma.map((p) => (
                  <li key={p.chave}>{p.titulo}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-green-800">Nada. O que cabe a plataforma esta feito.</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">O escritorio faz no primeiro acesso</p>
            <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
              <li>Escolher a propria senha, pelo convite.</li>
              {dados.aceitePendente ? <li>Aceitar os termos, o contrato e o acordo de LGPD.</li> : null}
              <li>Criar a senha de administracao (um minuto).</li>
              {dados.temNuvem ? <li>Conectar o OneDrive ou o Google Drive, se quiser (um clique).</li> : null}
            </ul>
          </div>
        </div>
        <button
          type="button"
          disabled={ocupado === "entregar"}
          onClick={() => {
            if (
              pendentesDaPlataforma.length &&
              !window.confirm(
                `Ainda falta: ${pendentesDaPlataforma.map((p) => p.titulo).join("; ")}.\n\nEntregar assim mesmo?`,
              )
            )
              return;
            agir("entregar", { acao: "entregar" });
          }}
          className="botao-principal mt-4"
        >
          {ocupado === "entregar" ? "Entregando..." : dados.entregueEm ? "Entregar de novo" : "Entregar ao escritorio"}
        </button>
        <Recado onde="entregar" />
        {convites ? (
          <div className="mt-4 grid gap-2">
            {convites.length === 0 ? (
              <p className="aviso-ok">Todos ja entraram: nenhum convite precisou sair.</p>
            ) : (
              convites.map((c) => (
                <div key={c.email} className={c.enviado ? "aviso-ok" : "aviso-atencao"}>
                  <p>
                    {c.enviado ? "Convite enviado para " : "Convite NAO saiu para "}
                    <strong>{c.email}</strong>
                    {c.motivo ? ` — ${c.motivo}` : ""}
                  </p>
                  {c.link ? (
                    <p className="mt-1 break-all text-xs">
                      Repasse este link a pessoa (vale uma vez, por 7 dias): <code>{c.link}</code>
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        ) : null}
      </Secao>
    </div>
  );
}

function Integracao({
  i,
  ocupado,
  agir,
  Recado,
}: {
  i: DadosDaImplantacao["integracoes"][number];
  ocupado: string | null;
  agir: (onde: string, corpo: Record<string, unknown>, form?: HTMLFormElement) => Promise<unknown>;
  Recado: (p: { onde: string }) => React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const onde = `integracao-${i.tipo}`;
  const selo =
    i.status === "OK"
      ? { texto: "conectada e testada", classe: "etiqueta-ok" }
      : i.status === "ERRO"
        ? { texto: "com erro", classe: "etiqueta-erro" }
        : { texto: "nao conectada", classe: "etiqueta-neutra" };

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const dadosDoForm: Record<string, string> = {};
    for (const campo of i.campos) {
      const entrada = form.elements.namedItem(campo.nome) as HTMLInputElement | HTMLTextAreaElement | null;
      if (!entrada) continue;
      // Certificado: o arquivo .pfx vira base64 aqui, no navegador.
      if (entrada instanceof HTMLInputElement && entrada.type === "file") {
        const arquivo = entrada.files?.[0];
        if (arquivo) {
          const bytes = new Uint8Array(await arquivo.arrayBuffer());
          let binario = "";
          for (const b of bytes) binario += String.fromCharCode(b);
          dadosDoForm[campo.nome] = btoa(binario);
        }
        continue;
      }
      dadosDoForm[campo.nome] = entrada.value.trim();
    }
    const r = (await agir(onde, { acao: "integracao", tipo: i.tipo, dados: dadosDoForm })) as { ok?: boolean } | null;
    if (r?.ok) {
      form.reset();
      setAberto(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{i.rotulo}</span>
        <span className={selo.classe}>{selo.texto}</span>
        {!i.oauth ? (
          <button type="button" onClick={() => setAberto((v) => !v)} className="ml-auto text-sm font-medium text-[color:var(--marca-primaria)] hover:underline">
            {aberto ? "Fechar" : i.status ? "Trocar credenciais" : "Conectar"}
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-slate-600">{i.descricao}</p>
      {i.erro ? <p className="mt-1 text-sm text-red-700">Ultimo erro: {i.erro}</p> : null}
      {i.oauth ? (
        <p className="mt-2 text-sm text-slate-500">
          Conecta-se entrando na conta do escritorio: ele faz no primeiro acesso, em Integracoes, com um clique.
        </p>
      ) : null}
      {aberto ? (
        <form onSubmit={enviar} className="mt-3 grid gap-3 border-t border-slate-100 pt-3">
          {i.campos.map((c) => (
            <label key={c.nome} className="grid gap-1 text-sm">
              <span className="rotulo mb-0">
                {i.tipo === "NFSE_CERT" && c.nome === "arquivo" ? "Arquivo do certificado (.pfx)" : c.rotulo}
              </span>
              {i.tipo === "NFSE_CERT" && c.nome === "arquivo" ? (
                <input name={c.nome} type="file" accept=".pfx,.p12" required={c.obrigatorio} className="text-sm" />
              ) : c.tipo === "textarea" ? (
                <textarea name={c.nome} rows={3} required={c.obrigatorio} className="campo font-mono text-xs" />
              ) : (
                <input name={c.nome} type={c.tipo} required={c.obrigatorio} autoComplete="off" className="campo" />
              )}
              {c.ajuda && !(i.tipo === "NFSE_CERT" && c.nome === "arquivo") ? <span className="ajuda mt-0">{c.ajuda}</span> : null}
            </label>
          ))}
          <button type="submit" disabled={ocupado === onde} className="botao-principal justify-self-start">
            {ocupado === onde ? "Testando..." : "Conectar e testar"}
          </button>
        </form>
      ) : null}
      <Recado onde={onde} />
    </div>
  );
}
