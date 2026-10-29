import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirOperador, SemOperador } from "@/lib/plataforma";
import { NavegacaoDaPlataforma } from "@/componentes/NavegacaoDaPlataforma";
import { BarraDeUso, CATEGORICA, Colunas, Linha, Numero } from "@/componentes/GraficosDoPainel";
import { coletarEscalabilidade } from "@/lib/escalabilidade-coleta";
import {
  ATENCAO,
  acumular,
  cabem,
  crescimentoPorMes,
  gargalos,
  mesesAte,
  nivelDe,
  precisamDeVacuum,
  recomendar,
  simularEscala,
  suspeitasDeIndice,
  type Recurso,
} from "@/lib/escalabilidade";
import { rotuloDoMes } from "@/lib/painel-plataforma";
import { dataHoraBR, horaBR } from "@/lib/datas";

export const dynamic = "force-dynamic";

const GB = 1024 ** 3;
const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const contagem = (v: number) => inteiro.format(v);

function bytes(v: number): string {
  if (v >= GB) return `${decimal.format(v / GB)} GB`;
  if (v >= 1024 ** 2) return `${inteiro.format(v / 1024 ** 2)} MB`;
  if (v >= 1024) return `${inteiro.format(v / 1024)} KB`;
  return `${inteiro.format(v)} B`;
}
const gb = (v: number) => bytes(v * GB);

function duracao(segundos: number): string {
  if (segundos < 1) return `${inteiro.format(segundos * 1000)} ms`;
  if (segundos < 120) return `${decimal.format(segundos)} s`;
  if (segundos < 7200) return `${inteiro.format(segundos / 60)} min`;
  if (segundos < 172_800) return `${decimal.format(segundos / 3600)} h`;
  return `${inteiro.format(segundos / 86_400)} dias`;
}

const nucleos = (v: number) => `${v < 0.1 ? decimal.format(v * 1000) + " m" : decimal.format(v)} vCPU`;

function emMeses(m: number | null): string {
  if (m === null) return "sem crescimento medido";
  if (m === 0) return "já passou";
  if (m > 120) return "mais de 10 anos";
  if (m >= 24) return `${inteiro.format(m / 12)} anos`;
  return m < 1 ? "menos de 1 mês" : `${inteiro.format(m)} meses`;
}

const ESTADO_DA_CONEXAO: Record<string, string> = {
  idle: "ociosa",
  active: "ativa",
  "idle in transaction": "parada em transação",
  "idle in transaction (aborted)": "transação com erro",
};

const ROTULO_DO_CONSUMO: Record<string, string> = {
  WHATSAPP_MSG: "Mensagens de WhatsApp",
  EMAIL_ENVIADO: "E-mails enviados",
  IA_MIL_TOKENS: "IA (mil tokens)",
  TRANSCRICAO_MIN: "Transcrição (minutos)",
  NFSE_EMITIDA: "Notas fiscais emitidas",
  COBRANCA_EMITIDA: "Cobranças emitidas",
  OAB_MONITORADA: "OABs monitoradas",
  ARMAZENAMENTO_MB: "Armazenamento (MB)",
  REGISTROS: "Registros",
  USUARIOS_ATIVOS: "Usuários ativos",
};

/**
 * Painel de escalabilidade: o que a plataforma aguenta hoje, o que acaba
 * primeiro e o que fazer antes. Tudo medido na hora — banco, fila, disco,
 * Railway — e so numero: nenhum dado de cliente de escritorio aparece.
 */
export default async function Escalabilidade() {
  let operador;
  try {
    operador = await exigirOperador();
  } catch (erro) {
    if (erro instanceof SemOperador) redirect("/plataforma/login");
    throw erro;
  }

  const c = await coletarEscalabilidade();
  const { banco, fila, volumes, crescimento, consumo, processo, espaco, servicos } = c;

  // --- Recursos e gargalos -------------------------------------------------
  const app = servicos?.find((s) => s.nome === "aplicacao") ?? servicos?.[0] ?? null;
  const trabalhador = servicos?.find((s) => s.nome.startsWith("trabalhador")) ?? null;
  const bancoServico = servicos?.find((s) => s.nome === "postgres") ?? null;
  const trabalhadores = Math.max(1, servicos?.filter((s) => s.nome.startsWith("trabalhador")).length ?? 1);
  const ocupacao = fila ? fila.segundosOcupados / 86_400 : 0;
  const conexoesUteis = banco ? banco.conexoes.maximo - banco.conexoes.reservadas : 0;

  const recursos: Recurso[] = [];
  if (espaco.banco)
    recursos.push({ chave: "banco", rotulo: "Disco do banco", usado: espaco.banco.usadoBytes, limite: espaco.banco.limiteBytes, unidade: "bytes" });
  if (espaco.arquivos)
    recursos.push({ chave: "arquivos", rotulo: "Disco dos arquivos", usado: espaco.arquivos.usadoBytes, limite: espaco.arquivos.limiteBytes, unidade: "bytes" });
  if (banco)
    recursos.push({ chave: "conexoes", rotulo: "Conexões do banco", usado: banco.conexoes.total, limite: conexoesUteis, unidade: "conexoes" });
  recursos.push({ chave: "fila", rotulo: "Ocupação do trabalhador", usado: ocupacao, limite: trabalhadores, unidade: "porcento" });
  for (const [s, rotulo] of [
    [app, "aplicação"],
    [trabalhador, "trabalhador"],
    [bancoServico, "PostgreSQL"],
  ] as const) {
    if (!s) continue;
    recursos.push({ chave: `mem-${s.nome}`, rotulo: `Memória do ${rotulo} (pico)`, usado: s.memoriaGb.pico, limite: s.memoriaGb.limite, unidade: "gb" });
    recursos.push({ chave: `cpu-${s.nome}`, rotulo: `CPU do ${rotulo} (pico)`, usado: s.cpu.pico, limite: s.cpu.limite, unidade: "nucleos" });
  }
  const lista = gargalos(recursos);
  const principal = lista[0];

  const escrever = (r: Recurso) => {
    if (r.unidade === "bytes") return `${bytes(r.usado)} de ${bytes(r.limite)}`;
    if (r.unidade === "gb") return `${gb(r.usado)} de ${gb(r.limite)}`;
    if (r.unidade === "nucleos") return `${nucleos(r.usado)} de ${nucleos(r.limite)}`;
    if (r.unidade === "conexoes") return `${r.usado} de ${r.limite}`;
    return `${duracao(r.usado * 86_400)} por dia em ${r.limite} trabalhador(es)`;
  };

  // --- Crescimento e projecao ---------------------------------------------
  const meses = crescimento?.porMes ?? [];
  const registrosAcumulados = acumular(meses.map((m) => m.registros), crescimento?.antes.registros ?? 0);
  const arquivosAcumulados = acumular(meses.map((m) => m.bytesArquivos), crescimento?.antes.bytesArquivos ?? 0);
  const escritoriosAcumulados = acumular(meses.map((m) => m.escritorios), crescimento?.antes.escritorios ?? 0);
  // n_live_tup e estimativa do ANALYZE: em banco recem-criado vem baixo demais.
  const linhasNoBanco = Math.max(banco ? banco.tabelas.reduce((s, t) => s + t.linhas, 0) : 0, registrosAcumulados.at(-1) ?? 0);
  const bytesPorRegistro = banco && linhasNoBanco ? banco.bytesDasTabelas / linhasNoBanco : 0;
  // O banco cresce com tudo que tem linha, nao so com o que e contado aqui;
  // por isso a conta usa o tamanho medio de linha do banco inteiro.
  const fatorDeLinhas = registrosAcumulados.at(-1) ? linhasNoBanco / registrosAcumulados.at(-1)! : 1;
  const bancoPorMes = crescimentoPorMes(registrosAcumulados) * fatorDeLinhas * bytesPorRegistro;
  const arquivosPorMes = crescimentoPorMes(arquivosAcumulados);
  const escritoriosPorMes = crescimentoPorMes(escritoriosAcumulados);
  const mesesBanco = espaco.banco ? mesesAte(espaco.banco.usadoBytes, espaco.banco.limiteBytes * ATENCAO, bancoPorMes) : null;
  const mesesArquivos = espaco.arquivos
    ? mesesAte(espaco.arquivos.usadoBytes, espaco.arquivos.limiteBytes * ATENCAO, arquivosPorMes)
    : null;

  // --- Capacidade por escritorio ------------------------------------------
  const ativos = volumes?.length ?? 0;
  const bytesFixos = banco ? banco.bytes - banco.bytesDasTabelas : 0;
  const base = {
    escritorios: ativos,
    bytesBanco: espaco.banco?.usadoBytes ?? banco?.bytes ?? 0,
    bytesBancoFixo: bytesFixos,
    limiteBanco: espaco.banco?.limiteBytes ?? 0,
    bytesArquivos: espaco.arquivos?.usadoBytes ?? 0,
    limiteArquivos: espaco.arquivos?.limiteBytes ?? 0,
    segundosDeTrabalhoPorDia: fila?.segundosOcupados ?? 0,
    trabalhadores,
    memoriaAppGb: app?.memoriaGb.pico ?? null,
    limiteMemoriaAppGb: app?.memoriaGb.limite ?? null,
  };
  const porEscritorio = {
    banco: ativos ? Math.max(0, base.bytesBanco - bytesFixos) / ativos : 0,
    arquivos: ativos ? base.bytesArquivos / ativos : 0,
    trabalho: ativos ? base.segundosDeTrabalhoPorDia / ativos : 0,
  };
  const capacidade = [
    { rotulo: "pelo disco do banco", n: cabem(porEscritorio.banco, base.limiteBanco, bytesFixos) },
    { rotulo: "pelo disco dos arquivos", n: cabem(porEscritorio.arquivos, base.limiteArquivos) },
    { rotulo: "pela fila de trabalhos", n: cabem(porEscritorio.trabalho, 86_400 * trabalhadores) },
  ];
  const limitante = capacidade
    .filter((x) => x.n !== null)
    .sort((a, b) => a.n! - b.n!)[0];
  const simulacao = simularEscala(base);

  const tabelasSuspeitas = banco ? suspeitasDeIndice(banco.tabelas) : [];
  const tabelasSujas = banco ? precisamDeVacuum(banco.tabelas) : [];
  const textos = recomendar({
    gargalos: lista,
    mesesAteBancoCheio: mesesBanco,
    mesesAteArquivosCheios: mesesArquivos,
    ocupacaoTrabalhador: ocupacao,
    trabalhadores,
    atrasadosNaFila: fila?.atrasados ?? 0,
    esperaP95Segundos: fila?.esperaP95 ?? 0,
    cacheDoBanco: banco?.cache ?? null,
    latenciaBancoMs: banco?.latenciaMs.mediana ?? 0,
    conexoes: { usadas: banco?.conexoes.total ?? 0, maximo: conexoesUteis },
    suspeitasDeIndice: tabelasSuspeitas.map((t) => t.nome),
    precisamDeVacuum: tabelasSujas.map((t) => t.nome),
    semMetricasDoRailway: !servicos,
    escritorios: ativos,
  });

  const totalDeRegistros = volumes?.reduce((s, v) => s + v.registros, 0) ?? 0;
  const maior = volumes?.[0];
  const competenciasDoConsumo = [...new Set((consumo ?? []).map((x) => x.competencia))].sort().slice(-6);
  const metricasDoConsumo = [...new Set((consumo ?? []).map((x) => x.metrica))];

  const indisponivel = (oQue: string) => (
    <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Não foi possível medir {oQue} agora. O resto do painel continua valendo.</p>
  );

  return (
    <main className="pagina">
      <NavegacaoDaPlataforma ativo="/plataforma/escalabilidade" operador={operador.nome} />
      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1>Escalabilidade</h1>
          <p className="mt-1 text-sm text-slate-500">
            O que a plataforma aguenta hoje, o que acaba primeiro e o que fazer antes. Medido agora, direto no banco, na fila
            e no Railway.
          </p>
        </div>
        <p className="text-sm text-slate-500">
          medido às {horaBR.format(c.medidoEm)}
          {processo.commit ? ` · versão ${processo.commit}` : ""} ·{" "}
          <Link href="/plataforma/escalabilidade" className="underline">
            medir de novo
          </Link>
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Numero
          rotulo="Recurso mais cheio"
          valor={principal ? `${Math.round(principal.fracao * 100)}%` : "—"}
          detalhe={principal ? principal.rotulo : "sem medida"}
          alerta={principal ? principal.nivel !== "ok" : false}
        />
        <Numero
          rotulo="Cabem hoje"
          valor={limitante ? `${contagem(limitante.n!)}` : "—"}
          detalhe={limitante ? `escritórios ${limitante.rotulo}, até 70%` : "falta uso para medir"}
        />
        <Numero
          rotulo="Escritórios em uso"
          valor={contagem(ativos)}
          detalhe={escritoriosPorMes > 0 ? `+${decimal.format(escritoriosPorMes)} por mês` : "sem entrada recente"}
        />
        <Numero
          rotulo="Banco"
          valor={espaco.banco ? bytes(espaco.banco.usadoBytes) : "—"}
          detalhe={`70% em ${emMeses(mesesBanco)}`}
          alerta={mesesBanco !== null && mesesBanco < 6}
        />
        <Numero
          rotulo="Arquivos"
          valor={espaco.arquivos ? bytes(espaco.arquivos.usadoBytes) : "—"}
          detalhe={`70% em ${emMeses(mesesArquivos)}`}
          alerta={mesesArquivos !== null && mesesArquivos < 6}
        />
        <Numero
          rotulo="Ida e volta ao banco"
          valor={banco ? `${decimal.format(banco.latenciaMs.mediana)} ms` : "—"}
          detalhe={banco ? `pior ${decimal.format(banco.latenciaMs.pior)} ms em 6 consultas` : "sem medida"}
          alerta={(banco?.latenciaMs.mediana ?? 0) > 20}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="cartao">
          <h2 className="text-lg font-bold">Uso de cada recurso</h2>
          <p className="ajuda">Do mais cheio para o mais folgado. O traço marca 70%: dali em diante, é hora de planejar o aumento.</p>
          <div className="mt-4 grid gap-4">
            {lista.map((r) => (
              <BarraDeUso key={r.chave} rotulo={r.rotulo} fracao={r.fracao} nivel={r.nivel} usado={escrever(r)} detalhe={r.detalhe} />
            ))}
          </div>
        </section>
        <section className="cartao">
          <h2 className="text-lg font-bold">O que fazer</h2>
          <ul className="mt-3 grid gap-2 text-slate-700">
            {textos.map((t) => (
              <li key={t} className="flex gap-2 leading-relaxed">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* ------------------------------------------------------------------ */}
      <section className="mt-8">
        <h2 className="text-xl font-bold">Capacidade e simulação</h2>
        <p className="ajuda">
          Uso médio de hoje por escritório: {bytes(porEscritorio.banco)} no banco, {bytes(porEscritorio.arquivos)} de arquivos e{" "}
          {duracao(porEscritorio.trabalho)} de trabalho por dia na fila. A conta é linear: cada escritório novo usa como os de
          hoje.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {capacidade.map((x) => (
            <Numero
              key={x.rotulo}
              rotulo={`Cabem ${x.rotulo}`}
              valor={x.n === null ? "—" : contagem(x.n)}
              detalhe={x.n === null ? "uso zero até agora" : x.n <= ativos * 2 ? "menos que o dobro de hoje" : "escritórios, até 70%"}
              alerta={x.n !== null && x.n <= ativos * 2}
            />
          ))}
        </div>
        <div className="cartao mt-4 overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Escritórios</th>
                <th className="text-right">Banco</th>
                <th className="text-right">Arquivos</th>
                <th className="text-right">Fila (ocupação)</th>
                <th className="text-right">Trabalhadores</th>
                <th>O que precisa mudar</th>
              </tr>
            </thead>
            <tbody>
              {simulacao.map((l) => (
                <tr key={l.escritorios}>
                  <td className="font-semibold tabular-nums">{contagem(l.escritorios)}</td>
                  <td className="text-right tabular-nums">
                    {bytes(l.banco)}
                    {base.limiteBanco ? <span className="text-slate-500"> · {inteiro.format((l.banco / base.limiteBanco) * 100)}%</span> : null}
                  </td>
                  <td className="text-right tabular-nums">
                    {bytes(l.arquivos)}
                    {base.limiteArquivos ? (
                      <span className="text-slate-500"> · {inteiro.format((l.arquivos / base.limiteArquivos) * 100)}%</span>
                    ) : null}
                  </td>
                  <td className="text-right tabular-nums">{inteiro.format(l.ocupacaoTrabalhador * 100)}%</td>
                  <td className="text-right tabular-nums">{l.trabalhadoresNecessarios}</td>
                  <td className={l.estoura.length ? "font-medium text-red-700" : "text-slate-500"}>
                    {l.estoura.length ? `Aumentar: ${l.estoura.join(", ")}` : "nada, cabe na estrutura de hoje"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="mt-8">
        <h2 className="text-xl font-bold">Crescimento</h2>
        <p className="ajuda">
          O que entrou em cada mês. Registros são clientes, processos, publicações, tarefas, compromissos, lançamentos e arquivos.
          A projeção do banco usa o ritmo dos últimos seis meses e o tamanho médio de linha de hoje (
          {bytesPorRegistro ? bytes(bytesPorRegistro) : "—"}): cerca de {bytes(Math.max(0, bancoPorMes))} por mês no banco e{" "}
          {bytes(Math.max(0, arquivosPorMes))} por mês em arquivos.
        </p>
        {crescimento ? (
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <Colunas
              titulo="Registros novos por mês"
              explicacao="Tudo o que os escritórios cadastraram ou receberam no mês."
              meses={meses.map((m) => ({ rotulo: rotuloDoMes(m.competencia), valores: [m.registros] }))}
              series={[{ rotulo: "Registros", cor: CATEGORICA[0] }]}
              formatar={contagem}
            />
            <Colunas
              titulo="Arquivos enviados por mês"
              explicacao="Peso dos anexos novos. É o que enche o disco dos arquivos."
              meses={meses.map((m) => ({ rotulo: rotuloDoMes(m.competencia), valores: [m.bytesArquivos] }))}
              series={[{ rotulo: "Arquivos", cor: CATEGORICA[2] }]}
              formatar={bytes}
            />
            <Colunas
              titulo="Escritórios e usuários novos por mês"
              explicacao="Entrada de gente: cada usuário é uma sessão a mais na aplicação."
              meses={meses.map((m) => ({ rotulo: rotuloDoMes(m.competencia), valores: [m.escritorios, m.usuarios] }))}
              series={[
                { rotulo: "Escritórios", cor: CATEGORICA[1] },
                { rotulo: "Usuários", cor: CATEGORICA[0] },
              ]}
              formatar={contagem}
            />
            <Colunas
              titulo="Total de registros ao fim de cada mês"
              explicacao="O acumulado. A inclinação desta escada é o ritmo usado na projeção."
              meses={meses.map((m, i) => ({ rotulo: rotuloDoMes(m.competencia), valores: [registrosAcumulados[i]] }))}
              series={[{ rotulo: "Registros", cor: CATEGORICA[0] }]}
              formatar={contagem}
            />
          </div>
        ) : (
          indisponivel("o crescimento")
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="mt-8">
        <h2 className="text-xl font-bold">Servidores (últimas 24 horas)</h2>
        <p className="ajuda">CPU, memória, rede e disco de cada serviço no Railway, de hora em hora.</p>
        {servicos ? (
          <>
            <div className="cartao mt-4 overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Serviço</th>
                    <th className="text-right">CPU média</th>
                    <th className="text-right">CPU pico</th>
                    <th className="text-right">Memória agora</th>
                    <th className="text-right">Memória pico</th>
                    <th className="text-right">Limite</th>
                    <th className="text-right">Rede (saída)</th>
                    <th className="text-right">Disco</th>
                  </tr>
                </thead>
                <tbody>
                  {servicos.map((s) => (
                    <tr key={s.servicoId}>
                      <td className="font-medium">{s.nome}</td>
                      <td className="text-right tabular-nums">{nucleos(s.cpu.media)}</td>
                      <td className="text-right tabular-nums">{nucleos(s.cpu.pico)}</td>
                      <td className="text-right tabular-nums">{gb(s.memoriaGb.atual)}</td>
                      <td className={`text-right tabular-nums ${nivelDe(s.memoriaGb.pico / (s.memoriaGb.limite || 1)) !== "ok" ? "font-semibold text-red-700" : ""}`}>
                        {gb(s.memoriaGb.pico)}
                      </td>
                      <td className="text-right tabular-nums text-slate-500">
                        {gb(s.memoriaGb.limite)} · {decimal.format(s.cpu.limite)} vCPU
                      </td>
                      <td className="text-right tabular-nums">{gb(s.redeSaidaGb)}</td>
                      <td className="text-right tabular-nums">{s.discoGb === null ? "—" : gb(s.discoGb)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <Linha
                titulo="Memória por serviço"
                series={servicos.slice(0, 5).map((s, i) => ({ rotulo: s.nome, cor: CATEGORICA[i], pontos: s.serieMemoria.map((p) => p.valor) }))}
                formatar={gb}
                rotulosDoEixo={["24 h atrás", "agora"]}
              />
              <Linha
                titulo="CPU por serviço"
                series={servicos.slice(0, 5).map((s, i) => ({ rotulo: s.nome, cor: CATEGORICA[i], pontos: s.serieCpu.map((p) => p.valor) }))}
                formatar={nucleos}
                rotulosDoEixo={["24 h atrás", "agora"]}
              />
            </div>
          </>
        ) : (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {c.servicosMotivo === "sem-token"
              ? "As métricas do Railway precisam da variável RAILWAY_TOKEN_METRICAS na aplicação: um token do projeto (Project Settings → Tokens), do ambiente production. O resto do painel não depende dela."
              : `O Railway não respondeu às métricas agora: ${c.servicosMotivo}`}
          </p>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="mt-8">
        <h2 className="text-xl font-bold">Banco de dados</h2>
        {banco ? (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Numero rotulo="Conexões" valor={`${banco.conexoes.total} / ${conexoesUteis}`} detalhe={`${banco.conexoes.reservadas} reservadas ao administrador`} alerta={banco.conexoes.total / (conexoesUteis || 1) >= ATENCAO} />
              <Numero
                rotulo="Leituras da memória"
                valor={banco.cache === null ? "—" : `${decimal.format(banco.cache * 100)}%`}
                detalhe="o ideal é acima de 99%"
                alerta={banco.cache !== null && banco.cache < 0.95}
              />
              <Numero
                rotulo="Transações"
                valor={contagem(banco.transacoes.confirmadas)}
                detalhe={`${contagem(banco.transacoes.desfeitas)} desfeitas${banco.transacoes.desde ? ` desde ${dataHoraBR.format(banco.transacoes.desde)}` : ""}`}
              />
              <Numero rotulo="Deadlocks" valor={contagem(banco.deadlocks)} detalhe="travas mútuas desde o início" alerta={banco.deadlocks > 0} />
              <Numero rotulo="Disco temporário" valor={bytes(banco.bytesTemporarios)} detalhe="consultas que não couberam na memória" />
              <Numero
                rotulo="Transação mais longa"
                valor={banco.maisLonga ? duracao(banco.maisLonga.segundos) : "nenhuma"}
                detalhe={banco.maisLonga ? (ESTADO_DA_CONEXAO[banco.maisLonga.estado] ?? banco.maisLonga.estado) : `PostgreSQL ${banco.versao}`}
                alerta={(banco.maisLonga?.segundos ?? 0) > 300}
              />
            </div>
            <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_2fr]">
              <div className="cartao overflow-x-auto">
                <h3 className="font-semibold">Conexões abertas agora</h3>
                <p className="ajuda">Por papel do banco e estado. Cada serviço mantém o próprio pool.</p>
                <table className="tabela mt-2">
                  <thead>
                    <tr>
                      <th>Papel</th>
                      <th>Estado</th>
                      <th className="text-right">Quantas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {banco.conexoes.porEstado.map((e) => (
                      <tr key={`${e.papel}-${e.estado}`}>
                        <td>{e.papel}</td>
                        <td>{ESTADO_DA_CONEXAO[e.estado] ?? e.estado}</td>
                        <td className="text-right tabular-nums">{e.quantas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="cartao overflow-x-auto">
                <h3 className="font-semibold">Maiores tabelas</h3>
                <p className="ajuda">
                  Tamanho com índices. “Leituras inteiras” alto numa tabela grande indica índice faltando; “linhas mortas” alto, vacuum
                  atrasado.
                </p>
                <table className="tabela mt-2">
                  <thead>
                    <tr>
                      <th>Tabela</th>
                      <th className="text-right">Tamanho</th>
                      <th className="text-right">Linhas</th>
                      <th className="text-right">Linhas mortas</th>
                      <th className="text-right">Leituras inteiras</th>
                      <th className="text-right">Leituras por índice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {banco.tabelas.slice(0, 15).map((t) => (
                      <tr key={t.nome} className={tabelasSuspeitas.includes(t) || tabelasSujas.includes(t) ? "text-red-700" : ""}>
                        <td className="font-medium">{t.nome}</td>
                        <td className="text-right tabular-nums">{bytes(t.bytes)}</td>
                        <td className="text-right tabular-nums">{contagem(t.linhas)}</td>
                        <td className="text-right tabular-nums">{contagem(t.linhasMortas)}</td>
                        <td className="text-right tabular-nums">{contagem(t.leiturasSequenciais)}</td>
                        <td className="text-right tabular-nums">{contagem(t.leiturasPorIndice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          indisponivel("o banco")
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="mt-8">
        <h2 className="text-xl font-bold">Fila de trabalhos</h2>
        <p className="ajuda">
          Avisos, lembretes, captura de publicações, notas, cópias. Cada trabalhador faz um trabalho por vez, e cada escritório tem um
          trabalho rodando por vez: um escritório com integração lenta não atrasa os outros.
        </p>
        {fila ? (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Numero rotulo="Prontos na fila" valor={contagem(fila.pendentes)} detalhe={`${fila.atrasados} esperando há mais de 5 min`} alerta={fila.atrasados > 0} />
              <Numero rotulo="Rodando" valor={contagem(fila.executando)} detalhe={fila.presos ? `${fila.presos} há mais de 30 min` : "nenhum preso"} alerta={fila.presos > 0} />
              <Numero rotulo="Feitos em 24 h" valor={contagem(fila.concluidos24h)} detalhe={`${decimal.format(fila.concluidos24h / 24)} por hora`} />
              <Numero
                rotulo="Falhas em 24 h"
                valor={contagem(fila.falhas24h)}
                detalhe={fila.concluidos24h + fila.falhas24h ? `${decimal.format((fila.falhas24h / (fila.concluidos24h + fila.falhas24h)) * 100)}% do total` : "nada rodou"}
                alerta={fila.falhas24h > 0}
              />
              <Numero rotulo="Ocupação" valor={`${decimal.format((ocupacao / trabalhadores) * 100)}%`} detalhe={`${duracao(fila.segundosOcupados)} de trabalho em 24 h`} alerta={ocupacao / trabalhadores >= ATENCAO} />
              <Numero rotulo="Espera (95%)" valor={duracao(fila.esperaP95)} detalhe="da hora marcada até começar" alerta={fila.esperaP95 > 300} />
            </div>
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <Colunas
                titulo="Trabalhos por hora"
                explicacao="Últimas 24 horas, pela hora em que terminaram."
                meses={fila.porHora.map((h) => ({ rotulo: horaBR.format(h.hora).slice(0, 2), valores: [h.concluidos, h.falhas] }))}
                series={[
                  { rotulo: "Feitos", cor: CATEGORICA[0] },
                  { rotulo: "Falharam", cor: CATEGORICA[1] },
                ]}
                formatar={contagem}
                rotuloDaColuna="Hora"
              />
              <div className="cartao overflow-x-auto">
                <h3 className="font-semibold">Por tipo de trabalho (24 h)</h3>
                <p className="ajuda">Do que mais ocupa o trabalhador para o que menos.</p>
                <table className="tabela mt-2">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th className="text-right">Feitos</th>
                      <th className="text-right">Falhas</th>
                      <th className="text-right">Duração média</th>
                      <th className="text-right">Duração 95%</th>
                      <th className="text-right">Espera 95%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fila.porTipo.map((t) => (
                      <tr key={t.tipo}>
                        <td className="font-medium">{t.tipo}</td>
                        <td className="text-right tabular-nums">{contagem(t.concluidos)}</td>
                        <td className={`text-right tabular-nums ${t.falhas ? "text-red-700" : ""}`}>{contagem(t.falhas)}</td>
                        <td className="text-right tabular-nums">{duracao(t.duracaoMedia)}</td>
                        <td className="text-right tabular-nums">{duracao(t.duracaoP95)}</td>
                        <td className="text-right tabular-nums">{duracao(t.esperaP95)}</td>
                      </tr>
                    ))}
                    {fila.porTipo.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-slate-500">Nenhum trabalho terminou nas últimas 24 horas.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
                {fila.maioresFilas.length ? (
                  <p className="mt-3 text-sm text-slate-600">
                    Mais trabalho esperando: {fila.maioresFilas.map((m) => `${m.escritorio} (${m.pendentes})`).join(", ")}.
                  </p>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          indisponivel("a fila")
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="mt-8">
        <h2 className="text-xl font-bold">Volume por escritório</h2>
        <p className="ajuda">
          Quem mais usa o sistema. Escritório que concentra muito do volume pesa mais na fila e no banco, e é o primeiro a sentir
          lentidão.
          {maior && totalDeRegistros
            ? ` Hoje, ${maior.nome} tem ${inteiro.format((maior.registros / totalDeRegistros) * 100)}% dos registros.`
            : ""}
        </p>
        {volumes ? (
          <div className="cartao mt-4 overflow-x-auto">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Escritório</th>
                  <th className="text-right">Usuários</th>
                  <th className="text-right">Clientes</th>
                  <th className="text-right">Processos</th>
                  <th className="text-right">Publicações</th>
                  <th className="text-right">Tarefas</th>
                  <th className="text-right">Arquivos</th>
                  <th className="text-right">Registros</th>
                  <th className="text-right">Parcela</th>
                </tr>
              </thead>
              <tbody>
                {volumes.slice(0, 25).map((v) => (
                  <tr key={v.id}>
                    <td>
                      <Link href={`/plataforma/${v.id}`} className="font-semibold text-marca">
                        {v.nome}
                      </Link>
                    </td>
                    <td className="text-right tabular-nums">{contagem(v.usuarios)}</td>
                    <td className="text-right tabular-nums">{contagem(v.clientes)}</td>
                    <td className="text-right tabular-nums">{contagem(v.processos)}</td>
                    <td className="text-right tabular-nums">{contagem(v.publicacoes)}</td>
                    <td className="text-right tabular-nums">{contagem(v.tarefas)}</td>
                    <td className="text-right tabular-nums">
                      {contagem(v.arquivos)} <span className="text-slate-500">· {bytes(v.bytesArquivos)}</span>
                    </td>
                    <td className="text-right font-medium tabular-nums">{contagem(v.registros)}</td>
                    <td className="text-right tabular-nums">
                      {totalDeRegistros ? `${inteiro.format((v.registros / totalDeRegistros) * 100)}%` : "—"}
                    </td>
                  </tr>
                ))}
                {volumes.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-slate-500">Nenhum escritório em uso.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {volumes.length > 25 ? <p className="ajuda mt-2">Mostrando os 25 maiores de {volumes.length}.</p> : null}
          </div>
        ) : (
          indisponivel("o volume por escritório")
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="cartao overflow-x-auto">
          <h2 className="text-lg font-bold">Serviços externos por mês</h2>
          <p className="ajuda">Soma de todos os escritórios. É o que cresce a conta de WhatsApp, IA, e-mail e notas.</p>
          {consumo && competenciasDoConsumo.length ? (
            <table className="tabela mt-2">
              <thead>
                <tr>
                  <th>Serviço</th>
                  {competenciasDoConsumo.map((m) => (
                    <th key={m} className="text-right">{rotuloDoMes(m)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metricasDoConsumo.map((metrica) => (
                  <tr key={metrica}>
                    <td>{ROTULO_DO_CONSUMO[metrica] ?? metrica}</td>
                    {competenciasDoConsumo.map((m) => (
                      <td key={m} className="text-right tabular-nums">
                        {decimal.format(consumo.find((x) => x.competencia === m && x.metrica === metrica)?.quantidade ?? 0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Nenhum consumo medido ainda.</p>
          )}
        </section>
        <section className="cartao">
          <h2 className="text-lg font-bold">Esta instância da aplicação</h2>
          <p className="ajuda">A cópia da aplicação que montou esta página.</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-slate-500">No ar há</dt>
            <dd className="tabular-nums">{duracao(processo.ligadoHaSegundos)}</dd>
            <dt className="text-slate-500">Memória</dt>
            <dd className="tabular-nums">
              {bytes(processo.memoriaBytes.rss)} <span className="text-slate-500">(heap {bytes(processo.memoriaBytes.heapUsado)} de {bytes(processo.memoriaBytes.heapTotal)})</span>
            </dd>
            <dt className="text-slate-500">Atraso do loop</dt>
            <dd className={`tabular-nums ${processo.atrasoDoLoopMs.p99 > 100 ? "font-semibold text-red-700" : ""}`}>
              média {decimal.format(processo.atrasoDoLoopMs.media)} ms · 99% até {decimal.format(processo.atrasoDoLoopMs.p99)} ms
            </dd>
            <dt className="text-slate-500">Núcleos visíveis</dt>
            <dd className="tabular-nums">{processo.nucleosVisiveis}</dd>
            <dt className="text-slate-500">Node.js</dt>
            <dd>{processo.node}</dd>
            {processo.deploy ? (
              <>
                <dt className="text-slate-500">Deploy</dt>
                <dd>
                  {processo.deploy}
                  {processo.replica ? ` · réplica ${processo.replica}` : ""}
                </dd>
              </>
            ) : null}
          </dl>
        </section>
      </div>
    </main>
  );
}
