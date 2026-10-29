// Coleta do painel de escalabilidade: o banco, a fila, o volume de cada
// escritorio, o crescimento mes a mes e as metricas do Railway.
//
// Le com o papel da plataforma, e so numero: contagem, tamanho e tempo.
// Nenhum dado de cliente de escritorio sai daqui. Cada parte falha sozinha —
// sem o Railway, por exemplo, o resto do painel aparece igual.
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import os from "node:os";
import { prismaPlataforma } from "./prisma";
import { medirArquivos, medirBanco, type Medida as MedidaDeEspaco } from "./saude-do-espaco";
import { acessoAsMetricas, metricasDosServicos } from "./railway";
import { resumirServicos, mediana, percentil, type ResumoDoServico, type TabelaDoBanco } from "./escalabilidade";

const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

async function ou<T>(promessa: Promise<T>): Promise<T | null> {
  try {
    return await promessa;
  } catch (erro) {
    console.error("escalabilidade:", (erro as Error).message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

export type ColetaDoBanco = {
  versao: string;
  bytes: number;
  bytesDasTabelas: number;
  conexoes: { maximo: number; reservadas: number; total: number; porEstado: Array<{ papel: string; estado: string; quantas: number }> };
  /** Fracao das leituras de bloco atendidas pela memoria, desde o ultimo reset. */
  cache: number | null;
  transacoes: { confirmadas: number; desfeitas: number; desde: Date | null };
  deadlocks: number;
  bytesTemporarios: number;
  latenciaMs: { mediana: number; pior: number };
  tabelas: TabelaDoBanco[];
  maisLonga: { segundos: number; estado: string } | null;
};

export async function coletarBanco(): Promise<ColetaDoBanco> {
  const db = prismaPlataforma();

  // Ida e volta: SELECT 1 tantas vezes, para a mediana nao ser um pico.
  const tempos: number[] = [];
  for (let i = 0; i < 7; i++) {
    const t0 = performance.now();
    await db.$queryRaw`SELECT 1`;
    tempos.push(performance.now() - t0);
  }

  const [[geral], estados, [estatistica], tabelas, [longa]] = await Promise.all([
    db.$queryRaw<Array<{ versao: string; bytes: bigint; maximo: number; reservadas: number; total: bigint }>>`
      SELECT current_setting('server_version') AS versao,
             pg_database_size(current_database()) AS bytes,
             current_setting('max_connections')::int AS maximo,
             current_setting('superuser_reserved_connections')::int AS reservadas,
             (SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'client backend') AS total`,
    // Sem pg_read_all_stats, o estado das sessoes de outro papel vem nulo: conta como "outro papel".
    db.$queryRaw<Array<{ papel: string | null; estado: string | null; quantas: bigint }>>`
      SELECT usename AS papel, state AS estado, count(*) AS quantas
        FROM pg_stat_activity
       WHERE backend_type = 'client backend'
       GROUP BY 1, 2
       ORDER BY 3 DESC`,
    db.$queryRaw<Array<{ hit: bigint; lido: bigint; commits: bigint; rollbacks: bigint; deadlocks: bigint; temp: bigint; desde: Date | null }>>`
      SELECT blks_hit AS hit, blks_read AS lido, xact_commit AS commits, xact_rollback AS rollbacks,
             deadlocks, temp_bytes AS temp, stats_reset AS desde
        FROM pg_stat_database WHERE datname = current_database()`,
    db.$queryRaw<Array<{ nome: string; bytes: bigint; linhas: bigint; mortas: bigint; seq: bigint | null; idx: bigint | null }>>`
      SELECT relname AS nome, pg_total_relation_size(relid) AS bytes,
             n_live_tup AS linhas, n_dead_tup AS mortas, seq_scan AS seq, idx_scan AS idx
        FROM pg_stat_user_tables
       WHERE relname <> '_prisma_migrations'
       ORDER BY 2 DESC`,
    db.$queryRaw<Array<{ segundos: number; estado: string | null }>>`
      SELECT extract(epoch FROM now() - xact_start)::float AS segundos, state AS estado
        FROM pg_stat_activity
       WHERE xact_start IS NOT NULL AND pid <> pg_backend_pid() AND backend_type = 'client backend'
       ORDER BY xact_start LIMIT 1`,
  ]);

  const hit = n(estatistica?.hit);
  const lido = n(estatistica?.lido);
  const lista = tabelas.map((t) => ({
    nome: t.nome,
    bytes: n(t.bytes),
    linhas: n(t.linhas),
    linhasMortas: n(t.mortas),
    leiturasSequenciais: n(t.seq),
    leiturasPorIndice: n(t.idx),
  }));
  return {
    versao: geral.versao,
    bytes: n(geral.bytes),
    bytesDasTabelas: lista.reduce((s, t) => s + t.bytes, 0),
    conexoes: {
      maximo: geral.maximo,
      reservadas: geral.reservadas,
      total: n(geral.total),
      porEstado: estados.map((e) => ({ papel: e.papel ?? "—", estado: e.estado ?? "outro papel", quantas: n(e.quantas) })),
    },
    cache: hit + lido > 0 ? hit / (hit + lido) : null,
    transacoes: { confirmadas: n(estatistica?.commits), desfeitas: n(estatistica?.rollbacks), desde: estatistica?.desde ?? null },
    deadlocks: n(estatistica?.deadlocks),
    bytesTemporarios: n(estatistica?.temp),
    latenciaMs: { mediana: mediana(tempos.slice(1)), pior: Math.max(...tempos.slice(1)) },
    tabelas: lista,
    maisLonga: longa ? { segundos: longa.segundos, estado: longa.estado ?? "outro papel" } : null,
  };
}

// ---------------------------------------------------------------------------
// Fila de trabalhos
// ---------------------------------------------------------------------------

export type ColetaDaFila = {
  pendentes: number;
  atrasados: number;
  executando: number;
  presos: number;
  porTipo: Array<{
    tipo: string;
    concluidos: number;
    falhas: number;
    duracaoMedia: number;
    duracaoP95: number;
    esperaP95: number;
  }>;
  porHora: Array<{ hora: Date; concluidos: number; falhas: number }>;
  segundosOcupados: number;
  esperaP95: number;
  concluidos24h: number;
  falhas24h: number;
  maioresFilas: Array<{ escritorio: string; pendentes: number }>;
};

export async function coletarFila(agora = new Date()): Promise<ColetaDaFila> {
  const db = prismaPlataforma();
  const desde = new Date(agora.getTime() - 24 * 3_600_000);
  const [[agoraNaFila], terminados, porHora, maiores] = await Promise.all([
    db.$queryRaw<Array<{ pendentes: bigint; atrasados: bigint; executando: bigint; presos: bigint }>>`
      SELECT count(*) FILTER (WHERE "estado" = 'PENDENTE' AND "agendadoPara" <= now()) AS pendentes,
             count(*) FILTER (WHERE "estado" = 'PENDENTE' AND "agendadoPara" < now() - interval '5 minutes') AS atrasados,
             count(*) FILTER (WHERE "estado" = 'EXECUTANDO') AS executando,
             count(*) FILTER (WHERE "estado" = 'EXECUTANDO' AND "iniciadoEm" < now() - interval '30 minutes') AS presos
        FROM "Trabalho"
       WHERE "estado" IN ('PENDENTE', 'EXECUTANDO')`,
    db.$queryRaw<Array<{ tipo: string; estado: string; duracao: number | null; espera: number | null }>>`
      SELECT "tipo", "estado",
             extract(epoch FROM "concluidoEm" - "iniciadoEm")::float AS duracao,
             extract(epoch FROM "iniciadoEm" - "agendadoPara")::float AS espera
        FROM "Trabalho"
       WHERE "estado" IN ('CONCLUIDO', 'FALHOU') AND "concluidoEm" >= ${desde}`,
    db.$queryRaw<Array<{ hora: Date; concluidos: bigint; falhas: bigint }>>`
      SELECT date_trunc('hour', "concluidoEm") AS hora,
             count(*) FILTER (WHERE "estado" = 'CONCLUIDO') AS concluidos,
             count(*) FILTER (WHERE "estado" = 'FALHOU') AS falhas
        FROM "Trabalho"
       WHERE "estado" IN ('CONCLUIDO', 'FALHOU') AND "concluidoEm" >= ${desde}
       GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<Array<{ escritorio: string | null; pendentes: bigint }>>`
      SELECT e."nome" AS escritorio, count(*) AS pendentes
        FROM "Trabalho" t LEFT JOIN "Escritorio" e ON e."id" = t."escritorioId"
       WHERE t."estado" = 'PENDENTE' AND t."agendadoPara" <= now()
       GROUP BY 1 ORDER BY 2 DESC LIMIT 5`,
  ]);

  const tipos = new Map<string, typeof terminados>();
  for (const t of terminados) tipos.set(t.tipo, [...(tipos.get(t.tipo) ?? []), t]);
  const duracoes = (l: typeof terminados) => l.map((t) => Math.max(0, t.duracao ?? 0));
  const esperas = (l: typeof terminados) => l.map((t) => Math.max(0, t.espera ?? 0));

  // Horas sem trabalho nenhum entram como zero: o grafico mostra o vazio.
  const horas: ColetaDaFila["porHora"] = [];
  const inicio = new Date(desde);
  inicio.setUTCMinutes(0, 0, 0);
  for (let h = 1; h <= 24; h++) {
    const hora = new Date(inicio.getTime() + h * 3_600_000);
    const achada = porHora.find((p) => new Date(p.hora).getTime() === hora.getTime());
    horas.push({ hora, concluidos: n(achada?.concluidos), falhas: n(achada?.falhas) });
  }

  return {
    pendentes: n(agoraNaFila?.pendentes),
    atrasados: n(agoraNaFila?.atrasados),
    executando: n(agoraNaFila?.executando),
    presos: n(agoraNaFila?.presos),
    porTipo: [...tipos.entries()]
      .map(([tipo, l]) => ({
        tipo,
        concluidos: l.filter((t) => t.estado === "CONCLUIDO").length,
        falhas: l.filter((t) => t.estado === "FALHOU").length,
        duracaoMedia: duracoes(l).reduce((s, v) => s + v, 0) / l.length,
        duracaoP95: percentil(duracoes(l), 95),
        esperaP95: percentil(esperas(l), 95),
      }))
      .sort((a, b) => b.duracaoMedia * (b.concluidos + b.falhas) - a.duracaoMedia * (a.concluidos + a.falhas)),
    porHora: horas,
    segundosOcupados: duracoes(terminados).reduce((s, v) => s + v, 0),
    esperaP95: percentil(esperas(terminados), 95),
    concluidos24h: terminados.filter((t) => t.estado === "CONCLUIDO").length,
    falhas24h: terminados.filter((t) => t.estado === "FALHOU").length,
    maioresFilas: maiores.map((m) => ({ escritorio: m.escritorio ?? "plataforma", pendentes: n(m.pendentes) })),
  };
}

// ---------------------------------------------------------------------------
// Volume por escritorio e crescimento
// ---------------------------------------------------------------------------

export type VolumeDoEscritorio = {
  id: string;
  nome: string;
  status: string;
  usuarios: number;
  clientes: number;
  processos: number;
  publicacoes: number;
  tarefas: number;
  arquivos: number;
  bytesArquivos: number;
  registros: number;
};

export async function coletarVolumes(): Promise<VolumeDoEscritorio[]> {
  const linhas = await prismaPlataforma().$queryRaw<
    Array<{ id: string; nome: string; status: string; usuarios: bigint; clientes: bigint; processos: bigint; publicacoes: bigint; tarefas: bigint; arquivos: bigint; bytes: bigint | null; compromissos: bigint; lancamentos: bigint }>
  >`
    SELECT e."id", e."nome", e."status",
           (SELECT count(*) FROM "Usuario" x WHERE x."escritorioId" = e."id" AND x."ativo") AS usuarios,
           (SELECT count(*) FROM "Cliente" x WHERE x."escritorioId" = e."id") AS clientes,
           (SELECT count(*) FROM "Processo" x WHERE x."escritorioId" = e."id") AS processos,
           (SELECT count(*) FROM "Publicacao" x WHERE x."escritorioId" = e."id") AS publicacoes,
           (SELECT count(*) FROM "Tarefa" x WHERE x."escritorioId" = e."id") AS tarefas,
           (SELECT count(*) FROM "Compromisso" x WHERE x."escritorioId" = e."id") AS compromissos,
           (SELECT count(*) FROM "Lancamento" x WHERE x."escritorioId" = e."id") AS lancamentos,
           (SELECT count(*) FROM "Arquivo" x WHERE x."escritorioId" = e."id") AS arquivos,
           (SELECT sum(x."tamanhoBytes") FROM "Arquivo" x WHERE x."escritorioId" = e."id") AS bytes
      FROM "Escritorio" e
     WHERE e."status" <> 'ENCERRADO'`;
  return linhas
    .map((l) => {
      const v = {
        id: l.id,
        nome: l.nome,
        status: l.status,
        usuarios: n(l.usuarios),
        clientes: n(l.clientes),
        processos: n(l.processos),
        publicacoes: n(l.publicacoes),
        tarefas: n(l.tarefas),
        arquivos: n(l.arquivos),
        bytesArquivos: n(l.bytes),
      };
      return {
        ...v,
        registros: v.clientes + v.processos + v.publicacoes + v.tarefas + v.arquivos + n(l.compromissos) + n(l.lancamentos),
      };
    })
    .sort((a, b) => b.registros - a.registros);
}

export type MesDeCrescimento = {
  competencia: string;
  escritorios: number;
  usuarios: number;
  registros: number;
  bytesArquivos: number;
};

/** O que entrou em cada um dos ultimos `meses` meses (fuso de Sao Paulo). */
export async function coletarCrescimento(meses = 12): Promise<{ porMes: MesDeCrescimento[]; antes: MesDeCrescimento }> {
  const linhas = await prismaPlataforma().$queryRaw<
    Array<{ competencia: string; tabela: string; quantos: bigint; bytes: bigint | null }>
  >`
    WITH limite AS (
      SELECT date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') - make_interval(months => ${meses - 1}::int) AS inicio
    ), datas AS (
      SELECT 'escritorios' AS tabela, "criadoEm" AS em, NULL::bigint AS bytes FROM "Escritorio"
      UNION ALL SELECT 'usuarios', "criadoEm", NULL FROM "Usuario"
      UNION ALL SELECT 'registros', "criadoEm", NULL FROM "Cliente"
      UNION ALL SELECT 'registros', "criadoEm", NULL FROM "Processo"
      UNION ALL SELECT 'registros', "criadoEm", NULL FROM "Publicacao"
      UNION ALL SELECT 'registros', "criadaEm", NULL FROM "Tarefa"
      UNION ALL SELECT 'registros', "criadoEm", NULL FROM "Compromisso"
      UNION ALL SELECT 'registros', "criadoEm", NULL FROM "Lancamento"
      UNION ALL SELECT 'arquivos', "criadoEm", "tamanhoBytes"::bigint FROM "Arquivo"
    )
    SELECT CASE WHEN (d.em AT TIME ZONE 'America/Sao_Paulo') < l.inicio THEN 'antes'
                ELSE to_char(d.em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') END AS competencia,
           d.tabela, count(*) AS quantos, sum(d.bytes) AS bytes
      FROM datas d CROSS JOIN limite l
     GROUP BY 1, 2`;

  const agora = new Date();
  const mesSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .format(agora)
    .slice(0, 7);
  const [ano, mes] = mesSP.split("-").map(Number);
  const competencias = Array.from({ length: meses }, (_, i) => {
    const d = new Date(Date.UTC(ano, mes - 1 - (meses - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const vazio = (competencia: string): MesDeCrescimento => ({ competencia, escritorios: 0, usuarios: 0, registros: 0, bytesArquivos: 0 });
  const mapa = new Map<string, MesDeCrescimento>([["antes", vazio("antes")], ...competencias.map((c) => [c, vazio(c)] as const)]);
  for (const l of linhas) {
    const m = mapa.get(l.competencia);
    if (!m) continue;
    if (l.tabela === "escritorios") m.escritorios += n(l.quantos);
    if (l.tabela === "usuarios") m.usuarios += n(l.quantos);
    if (l.tabela === "registros") m.registros += n(l.quantos);
    if (l.tabela === "arquivos") {
      m.registros += n(l.quantos);
      m.bytesArquivos += n(l.bytes);
    }
  }
  return { porMes: competencias.map((c) => mapa.get(c)!), antes: mapa.get("antes")! };
}

export type ConsumoExterno = { competencia: string; metrica: string; quantidade: number };

export async function coletarConsumo(meses = 6): Promise<ConsumoExterno[]> {
  const linhas = await prismaPlataforma().consumoMensal.groupBy({
    by: ["competencia", "metrica"],
    _sum: { quantidade: true },
    orderBy: { competencia: "desc" },
  });
  const competencias = [...new Set(linhas.map((l) => l.competencia))].slice(0, meses);
  return linhas
    .filter((l) => competencias.includes(l.competencia))
    .map((l) => ({ competencia: l.competencia, metrica: l.metrica, quantidade: l._sum.quantidade ?? 0 }));
}

// ---------------------------------------------------------------------------
// Este processo (a instancia da aplicacao que respondeu)
// ---------------------------------------------------------------------------

export type ColetaDoProcesso = {
  node: string;
  ligadoHaSegundos: number;
  memoriaBytes: { rss: number; heapUsado: number; heapTotal: number; externo: number };
  atrasoDoLoopMs: { media: number; p99: number };
  nucleosVisiveis: number;
  commit: string | null;
  deploy: string | null;
  replica: string | null;
};

export async function coletarProcesso(): Promise<ColetaDoProcesso> {
  // Atraso do event loop em 300 ms: mostra se a aplicacao esta engasgando.
  const h = monitorEventLoopDelay({ resolution: 10 });
  h.enable();
  await new Promise((r) => setTimeout(r, 300));
  h.disable();
  const m = process.memoryUsage();
  return {
    node: process.version,
    ligadoHaSegundos: process.uptime(),
    memoriaBytes: { rss: m.rss, heapUsado: m.heapUsed, heapTotal: m.heapTotal, externo: m.external },
    atrasoDoLoopMs: { media: h.mean / 1e6 || 0, p99: h.percentile(99) / 1e6 || 0 },
    nucleosVisiveis: os.availableParallelism?.() ?? os.cpus().length,
    commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    deploy: process.env.RAILWAY_DEPLOYMENT_ID?.slice(0, 8) ?? null,
    replica: process.env.RAILWAY_REPLICA_ID?.slice(0, 8) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Tudo junto
// ---------------------------------------------------------------------------

export type ColetaDaEscalabilidade = {
  banco: ColetaDoBanco | null;
  fila: ColetaDaFila | null;
  volumes: VolumeDoEscritorio[] | null;
  crescimento: Awaited<ReturnType<typeof coletarCrescimento>> | null;
  consumo: ConsumoExterno[] | null;
  processo: ColetaDoProcesso;
  espaco: { arquivos: MedidaDeEspaco | null; banco: MedidaDeEspaco | null };
  servicos: ResumoDoServico[] | null;
  /** Por que nao ha metricas do Railway: sem configuracao ou com erro. */
  servicosMotivo: string | null;
  medidoEm: Date;
};

export async function coletarEscalabilidade(agora = new Date()): Promise<ColetaDaEscalabilidade> {
  const acesso = acessoAsMetricas();
  let servicosMotivo: string | null = acesso ? null : "sem-token";
  const [banco, fila, volumes, crescimento, consumo, processo, arquivos, bancoEspaco, railway] = await Promise.all([
    ou(coletarBanco()),
    ou(coletarFila(agora)),
    ou(coletarVolumes()),
    ou(coletarCrescimento()),
    ou(coletarConsumo()),
    coletarProcesso(),
    ou(medirArquivos()),
    ou(medirBanco()),
    acesso
      ? metricasDosServicos(acesso, new Date(agora.getTime() - 24 * 3_600_000)).catch((erro: Error) => {
          servicosMotivo = erro.message.slice(0, 200);
          return null;
        })
      : Promise.resolve(null),
  ]);
  return {
    banco,
    fila,
    volumes,
    crescimento,
    consumo,
    processo,
    espaco: { arquivos, banco: bancoEspaco },
    servicos: railway ? resumirServicos(railway.series, railway.nomes) : null,
    servicosMotivo,
    medidoEm: agora,
  };
}
