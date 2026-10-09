// Importacao de clientes por planilha: o que toca banco.
//
// Sem estado entre os passos: a pessoa envia o arquivo para conferir e envia
// de novo para importar. O arquivo nunca e gravado — tem dados pessoais e,
// depois de lido, ja cumpriu o papel. O que fica e o registro da importacao
// (quem, quando, quantos) e a marca em cada cliente criado, que e o que
// permite desfazer o lote.
import { comEscritorio, semEscritorio } from "./prisma";
import { lerPlanilha, PlanilhaInvalida, type Celula } from "./planilha";
import {
  classificarLinhas,
  contar,
  sugerirMapeamento,
  type Contagem,
  type LinhaClassificada,
  type Mapeamento,
} from "./importacao-clientes";
import { digitos, normalizarNome } from "./duplicados";

export const LIMITE_DE_LINHAS = 5000;
export const TAMANHO_MAXIMO_MB = 10;

export type Analise = {
  formato: "XLSX" | "CSV";
  aba: string | null;
  cabecalho: string[];
  /** Ate tres valores de exemplo por coluna, para quem confere o mapeamento. */
  exemplos: string[][];
  mapeamento: Mapeamento;
  linhas: LinhaClassificada[];
  contagem: Contagem;
};

/** A primeira linha com algum texto e o cabecalho. */
function separarCabecalho(linhas: Celula[][]) {
  const i = linhas.findIndex((l) => l.some((c) => c?.texto));
  if (i < 0) throw new PlanilhaInvalida("A planilha esta vazia.");
  const cabecalho = linhas[i].map((c) => c?.texto ?? "");
  const largura = Math.max(cabecalho.length, ...linhas.slice(i + 1).map((l) => l.length));
  while (cabecalho.length < largura) cabecalho.push(`Coluna ${cabecalho.length + 1}`);
  // Linhas vazias no fim (comum em exportacao) nao contam.
  let ultima = linhas.length - 1;
  while (ultima > i && !linhas[ultima].some((c) => c?.texto)) ultima--;
  const dados = linhas.slice(i + 1, ultima + 1).map((celulas, j) => ({ numero: i + 2 + j, celulas }));
  return { cabecalho: cabecalho.map((t, k) => t || `Coluna ${k + 1}`), dados };
}

async function existentesDo(escritorioId: string) {
  const clientes = await comEscritorio(escritorioId, (db) =>
    db.cliente.findMany({ select: { nome: true, documento: true } }),
  );
  return {
    documentos: new Set(clientes.map((c) => digitos(c.documento)).filter(Boolean)),
    nomesSemDocumento: new Set(clientes.filter((c) => !digitos(c.documento)).map((c) => normalizarNome(c.nome))),
    nomes: new Set(clientes.map((c) => normalizarNome(c.nome))),
  };
}

export async function analisarPlanilha(
  escritorioId: string,
  conteudo: Buffer,
  mapeamento?: Mapeamento | null,
): Promise<Analise> {
  const p = await lerPlanilha(conteudo);
  const { cabecalho, dados } = separarCabecalho(p.linhas);
  if (dados.length > LIMITE_DE_LINHAS) {
    throw new PlanilhaInvalida(
      `A planilha tem ${dados.length} linhas; o limite por importacao e ${LIMITE_DE_LINHAS}. Divida em partes.`,
    );
  }
  const mapa =
    mapeamento && mapeamento.length === cabecalho.length ? mapeamento : sugerirMapeamento(cabecalho);
  // Sem coluna de nome, toda linha sai "sem nome" — e a tela mostra isso,
  // para a pessoa escolher a coluna certa.
  const exemplos = cabecalho.map((_, k) =>
    dados
      .map((d) => d.celulas[k]?.texto ?? "")
      .filter(Boolean)
      .slice(0, 3),
  );
  const linhas = classificarLinhas(dados, mapa, await existentesDo(escritorioId));
  return { formato: p.formato, aba: p.aba, cabecalho, exemplos, mapeamento: mapa, linhas, contagem: contar(linhas) };
}

export class SemColunaDeNome extends Error {
  readonly status = 400;
  constructor() {
    super("Escolha qual coluna da planilha e o nome do cliente.");
    this.name = "SemColunaDeNome";
  }
}

export type ResultadoDaImportacao = {
  importacaoId: string;
  importados: number;
  contagem: Contagem;
};

/** Grava os NOVOS. O resto fica no relatorio. Tudo marcado com o lote. */
export async function importarPlanilha(
  escritorioId: string,
  nomeDoArquivo: string,
  feitaPor: string,
  conteudo: Buffer,
  mapeamento: Mapeamento,
): Promise<ResultadoDaImportacao> {
  if (!mapeamento.includes("nome")) throw new SemColunaDeNome();
  const a = await analisarPlanilha(escritorioId, conteudo, mapeamento);
  const novos = a.linhas.filter((l) => l.situacao === "NOVO");

  const registro = await comEscritorio(escritorioId, (db) =>
    db.importacaoDeClientes.create({
      data: semEscritorio({
        nomeDoArquivo: nomeDoArquivo.slice(0, 200),
        feitaPor,
        linhas: a.linhas.filter((l) => l.situacao !== "VAZIA").length,
        importados: 0,
        jaExistiam: a.contagem.JA_CADASTRADO + a.contagem.REPETIDO_NA_PLANILHA,
        recusados: a.contagem.PROBLEMA,
      }),
    }),
  );

  // Em blocos: um lote de 5 mil clientes numa transacao so seguraria a
  // conexao tempo demais.
  let importados = 0;
  for (let i = 0; i < novos.length; i += 500) {
    const bloco = novos.slice(i, i + 500);
    const r = await comEscritorio(escritorioId, (db) =>
      db.cliente.createMany({
        data: bloco.map((l) =>
          semEscritorio({
            nome: l.dados.nome,
            documento: l.dados.documento,
            email: l.dados.email,
            telefone: l.dados.telefone,
            rg: l.dados.rg,
            nascimento: l.dados.nascimento ? new Date(`${l.dados.nascimento}T00:00:00Z`) : null,
            nacionalidade: l.dados.nacionalidade,
            estadoCivil: l.dados.estadoCivil,
            profissao: l.dados.profissao,
            observacoes: l.dados.observacoes,
            endereco: l.dados.endereco ?? undefined,
            importacaoId: registro.id,
          }),
        ),
      }),
    );
    importados += r.count;
  }

  await comEscritorio(escritorioId, (db) =>
    db.importacaoDeClientes.update({ where: { id: registro.id }, data: { importados } }),
  );
  return { importacaoId: registro.id, importados, contagem: a.contagem };
}

/**
 * Desfaz o lote: apaga os clientes que ele criou e que AINDA NAO TEM NADA
 * ligado. Cliente que ja ganhou processo, cobranca, documento, compromisso
 * ou contrato fica — apagar levaria junto trabalho feito depois da
 * importacao. A tela diz quantos ficaram.
 */
export async function desfazerImportacao(escritorioId: string, importacaoId: string) {
  return comEscritorio(escritorioId, async (db) => {
    const imp = await db.importacaoDeClientes.findFirst({ where: { id: importacaoId } });
    if (!imp) throw new PlanilhaInvalida("Importacao nao encontrada.");
    if (imp.desfeitaEm) return { apagados: 0, mantidos: imp.mantidosAoDesfazer ?? 0 };

    const { count } = await db.cliente.deleteMany({
      where: {
        importacaoId,
        processos: { none: {} },
        cobrancas: { none: {} },
        arquivos: { none: {} },
        notas: { none: {} },
        compromissos: { none: {} },
        prazos: { none: {} },
        contratos: { none: {} },
        comparecimentos: { none: {} },
        entrevistas: { none: {} },
        tarefas: { none: {} },
        representantes: { none: {} },
      },
    });
    const mantidos = await db.cliente.count({ where: { importacaoId } });
    await db.importacaoDeClientes.update({
      where: { id: importacaoId },
      data: { desfeitaEm: new Date(), mantidosAoDesfazer: mantidos },
    });
    return { apagados: count, mantidos };
  });
}

export async function importacoesDoEscritorio(escritorioId: string) {
  return comEscritorio(escritorioId, (db) =>
    db.importacaoDeClientes.findMany({ orderBy: { criadaEm: "desc" }, take: 20 }),
  );
}
