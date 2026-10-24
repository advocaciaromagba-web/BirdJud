"use client";

import Link from "next/link";
import { useState } from "react";
import {
  FAIXAS_PUBLICADAS,
  LIMITES,
  rotuloDoTamanho,
  type Faixa,
  type Modulo,
} from "@/lib/catalogo";
import { TABELA_PADRAO, percentualEmTexto, precoDoModulo, type TabelaDePrecos } from "@/lib/precos";
import {
  contaDoPlano,
  contaMontada,
  modulosDoPlano,
  MODULOS_COBRAVEIS,
  PLANO,
  PLANOS,
  planoExato,
  type Plano,
} from "@/lib/planos";
import { emReais } from "@/lib/dinheiro";
import { Icone, type NomeDeIcone } from "./Icone";

const DESCRICAO_DO_MODULO: Record<
  string,
  { rotulo: string; texto: string; icone: NomeDeIcone }
> = {
  PUBLICACOES_DJEN: {
    rotulo: "Publicações do DJEN",
    texto:
      "As OABs do escritório consultadas todo dia, com o prazo do texto em destaque.",
    icone: "publicacoes",
  },
  NUVEM: {
    rotulo: "Arquivos",
    texto:
      "Documento guardado junto do cliente e do processo, com franquia por plano.",
    icone: "arquivos",
  },
  EMAIL: {
    rotulo: "Aviso por e-mail",
    texto: "O que aconteceu no dia chega na caixa de quem precisa saber.",
    icone: "conta",
  },
  COBRANCAS: {
    rotulo: "Cobranças",
    texto: "Boleto e Pix emitidos na conta do próprio escritório.",
    icone: "cobrancas",
  },
  FINANCEIRO: {
    rotulo: "Financeiro",
    texto:
      "Entradas e saídas do escritório, com a baixa da cobrança caindo sozinha.",
    icone: "financeiro",
  },
  NFSE: {
    rotulo: "Nota fiscal de serviço",
    texto:
      "NFS-e pelo padrão nacional, assinada com o certificado do escritório.",
    icone: "notas",
  },
  IA: {
    rotulo: "Inteligência artificial",
    texto:
      "Lê o documento e preenche o cadastro, resume a publicação e rascunha a manifestação. Sem ela, o cadastro é digitado à mão.",
    icone: "ia",
  },
  WHATSAPP: {
    rotulo: "Aviso por WhatsApp",
    texto: "Audiência e prazo avisados no telefone, por modelo aprovado.",
    icone: "clientes",
  },
  ASSINATURA: {
    rotulo: "Assinatura eletrônica",
    texto: "Procuração e contrato assinados sem imprimir.",
    icone: "processos",
  },
};

export function SimuladorDePlanos({
  contato,
  tabela = TABELA_PADRAO,
}: {
  contato?: string;
  /** A tabela vigente, vinda do servidor: a vitrine mostra o que a fatura cobra. */
  tabela?: TabelaDePrecos;
}) {
  // Abre na faixa de entrada: e o preco que a pessoa veio ver primeiro.
  const [faixa, setFaixa] = useState<Faixa>(FAIXAS_PUBLICADAS[0]);
  // Acima da maior faixa publicada nao ha preco na tela: ha uma conversa.
  const [sobConsulta, setSobConsulta] = useState(false);
  const [escolhidos, setEscolhidos] = useState<Set<Modulo>>(new Set());

  const maiorPublicada = FAIXAS_PUBLICADAS[FAIXAS_PUBLICADAS.length - 1];
  const conta = contaMontada([...escolhidos], faixa, tabela);
  const equivalente = planoExato([...escolhidos]);

  function alternar(modulo: Modulo) {
    setEscolhidos((atuais) => {
      const novos = new Set(atuais);
      if (novos.has(modulo)) novos.delete(modulo);
      else novos.add(modulo);
      return novos;
    });
  }

  function levarOPlano(plano: Plano) {
    setEscolhidos(new Set(modulosDoPlano(plano)));
  }

  return (
    <>
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">Tamanho do escritório:</span>
          {FAIXAS_PUBLICADAS.map((opcao) => (
            <button
              key={opcao}
              type="button"
              onClick={() => {
                setFaixa(opcao);
                setSobConsulta(false);
              }}
              aria-pressed={!sobConsulta && opcao === faixa}
              className={
                !sobConsulta && opcao === faixa
                  ? "botao-principal"
                  : "botao-secundario"
              }
            >
              {rotuloDoTamanho(opcao)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSobConsulta(true)}
            aria-pressed={sobConsulta}
            className={sobConsulta ? "botao-principal" : "botao-secundario"}
          >
            mais de {LIMITES[maiorPublicada].advogados}
          </button>
        </div>
        <p className="ajuda">
          A faixa vale para advogados e para a equipe de apoio, separadamente: a{" "}
          {LIMITES[faixa].rotulo} permite {LIMITES[faixa].advogados}{" "}
          {LIMITES[faixa].advogados === 1 ? "advogado" : "advogados"} e{" "}
          {LIMITES[faixa].apoio} pessoas de apoio.
        </p>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-4">
        {PLANOS.map((plano) => {
          const doPlano = contaDoPlano(plano, faixa, tabela);
          const escolhido = equivalente === plano;
          const top = plano === "COMPLETO";
          return (
            <article
              key={plano}
              className={`cartao flex flex-col ${top ? "ring-1" : ""}`}
              style={
                top ? { borderColor: "var(--marca-secundaria)" } : undefined
              }
            >
              {top ? <p className="sobretitulo">Mais completo</p> : null}
              <h2 className="mt-1 text-lg">{PLANO[plano].rotulo}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                {PLANO[plano].chamada}
              </p>

              {sobConsulta ? (
                <>
                  <p className="mt-4 text-2xl font-bold tracking-tight">
                    Sob consulta
                  </p>
                  <p className="ajuda">
                    Os módulos são os mesmos; muda o tamanho.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-4 text-2xl font-bold tracking-tight">
                    {emReais(doPlano.totalCentavos)}
                    <span className="text-sm font-normal text-slate-500">
                      {" "}
                      /mês
                    </span>
                  </p>
                  {tabela.descontoTrimestral > 0 ? (
                    <p className="ajuda">
                      No trimestral: {emReais(Math.round(doPlano.totalCentavos * 3 * (1 - tabela.descontoTrimestral)))} a cada 3 meses
                      ({percentualEmTexto(tabela.descontoTrimestral)} de desconto).
                    </p>
                  ) : null}
                  <p className="ajuda">
                    No anual: {emReais(Math.round(doPlano.totalCentavos * 12 * (1 - tabela.descontoAnual)))} por ano
                    ({percentualEmTexto(tabela.descontoAnual)} de desconto).
                  </p>
                  {doPlano.descontoCentavos > 0 ? (
                    <p className="ajuda">
                      {emReais(doPlano.descontoCentavos)} por mês a menos do que
                      levar estes módulos avulsos.
                    </p>
                  ) : (
                    <p className="ajuda">Só o núcleo do sistema, sem módulo.</p>
                  )}
                </>
              )}

              <ul className="mt-4 grid flex-1 content-start gap-1.5 text-sm">
                <li className="flex gap-2">
                  <span className="destaque">✓</span> Clientes, processos,
                  agenda e prazos
                </li>
                {modulosDoPlano(plano).map((modulo) => (
                  <li key={modulo} className="flex gap-2">
                    <span className="destaque">✓</span>
                    {DESCRICAO_DO_MODULO[modulo]?.rotulo ?? modulo}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => levarOPlano(plano)}
                className={
                  escolhido ? "botao-secundario mt-4" : "botao-principal mt-4"
                }
              >
                {sobConsulta
                  ? "Escolher este"
                  : escolhido
                    ? "Selecionado"
                    : "Escolher este"}
              </button>
            </article>
          );
        })}
      </section>

      <section className="mt-12">
        <p className="sobretitulo">Ou monte o seu</p>
        <h2 className="mt-2 text-2xl">Leve só o que o escritório usa</h2>
        <p className="chamada max-w-2xl">
          Marque os módulos e veja o preço mudar. Se algum plano pronto contém
          tudo que você marcou e sai mais barato, é ele que vale — e o resto vem
          junto.
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
          <ul className="grid gap-2 sm:grid-cols-2">
            {MODULOS_COBRAVEIS.map((modulo) => {
              const marcado = escolhidos.has(modulo);
              const descricao = DESCRICAO_DO_MODULO[modulo];
              return (
                <li key={modulo}>
                  <label
                    className={`flex h-full cursor-pointer gap-3 rounded-xl border p-4 transition ${
                      marcado
                        ? "border-slate-400 bg-white"
                        : "border-slate-200 bg-white/60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternar(modulo)}
                      className="mt-1 h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-baseline gap-2">
                        <span className="destaque">
                          <Icone
                            nome={descricao?.icone ?? "painel"}
                            className="h-4 w-4"
                          />
                        </span>
                        <span className="font-semibold">
                          {descricao?.rotulo ?? modulo}
                        </span>
                        <span className="text-sm text-slate-500">
                          + {emReais(precoDoModulo(modulo, faixa, tabela))}/mes
                        </span>
                      </span>
                      <span className="mt-1 block text-sm leading-relaxed text-slate-600">
                        {descricao?.texto}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <aside className="cartao h-fit lg:sticky lg:top-6">
            {sobConsulta ? (
              <>
                <h3>Escritório grande</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Acima de {LIMITES[maiorPublicada].advogados} advogados o preço
                  sai de uma proposta: a franquia de cada módulo é ajustada ao
                  uso real do escritório, e a migração do sistema atual entra na
                  conversa.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Os módulos são os mesmos desta página — o que muda é o
                  tamanho, não o que o sistema faz.
                </p>
                {contato ? (
                  <a
                    href={`mailto:${contato}`}
                    className="botao-principal mt-4 w-full"
                  >
                    Pedir uma proposta
                  </a>
                ) : (
                  <Link
                    href="/cadastro"
                    className="botao-principal mt-4 w-full"
                  >
                    Começar pelo teste
                  </Link>
                )}
                <p className="ajuda">
                  O teste de 14 dias vale igual, e serve para o escritório ver o
                  sistema antes de qualquer proposta.
                </p>
              </>
            ) : (
              <>
                <h3>Sua mensalidade</h3>
                <dl className="mt-3 grid gap-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-600">
                      Sistema, {rotuloDoTamanho(faixa)}
                    </dt>
                    <dd className="tabular-nums">
                      {emReais(conta.faixaCentavos)}
                    </dd>
                  </div>
                  {conta.modulos.map((linha) => (
                    <div
                      key={linha.modulo}
                      className="flex justify-between gap-3"
                    >
                      <dt className="text-slate-600">
                        {DESCRICAO_DO_MODULO[linha.modulo]?.rotulo ??
                          linha.modulo}
                      </dt>
                      <dd className="tabular-nums">
                        {emReais(linha.valorCentavos)}
                      </dd>
                    </div>
                  ))}
                  {conta.descontoCentavos > 0 ? (
                    <div className="flex justify-between gap-3">
                      <dt className="destaque">
                        Economia do plano {PLANO[conta.plano!].rotulo}
                      </dt>
                      <dd className="destaque tabular-nums">
                        − {emReais(conta.descontoCentavos)}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                <p className="mt-4 border-t border-slate-200 pt-3 text-2xl font-bold tracking-tight">
                  {emReais(conta.totalCentavos)}
                  <span className="text-sm font-normal text-slate-500">
                    {" "}
                    /mês
                  </span>
                </p>

                {conta.plano && conta.plano !== "ESSENCIAL" ? (
                  <p className="aviso-ok mt-3">
                    O plano {PLANO[conta.plano].rotulo} cobre o que você marcou
                    e sai mais barato que a soma avulsa. Você leva também o que
                    sobra dele.
                  </p>
                ) : null}

                <Link
                  href={
                    conta.modulos.length > 0
                      ? `/cadastro?modulos=${conta.modulos.map((l) => l.modulo).join(",")}`
                      : "/cadastro?modulos="
                  }
                  className="botao-principal mt-4 w-full"
                >
                  Começar o teste
                </Link>
                <p className="ajuda">
                  Consumo que passa da franquia (mensagem, nota, token de IA,
                  armazenamento) é cobrado à parte, pelo que foi usado.
                </p>
              </>
            )}
          </aside>
        </div>
      </section>
    </>
  );
}
