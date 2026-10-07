// O modelo no banco e no disco, e a peca pronta.
//
// A regra de preencher mora em modelos.ts, pura e testada; a mexida no .docx
// em docx.ts. Aqui so se guarda, se escolhe qual modelo vale e se junta os
// dados do cliente, do contrato e do escritorio.
import type { Prisma } from "@prisma/client";
import { comEscritorio, semEscritorio } from "./prisma";
import { gravar, ler, apagar } from "./armazenamento";
import { emReais, porExtenso } from "./dinheiro";
import { formatarDocumento } from "./documentos";
import { enderecoEmLinha, ehPessoaJuridica, qualificacao } from "./representantes";
import { comoSeContrata, percentualEmTexto, planoDoContrato } from "./honorarios";
import {
  cidadeEData,
  enderecoEmLinha as enderecoDaSede,
  linhasDeAssinatura,
  qualificacaoDoEscritorio,
  qualificacaoDosAdvogados,
  sedeDe,
  type AdvogadoParaQualificar,
} from "./qualificacao";
import {
  lerTextos,
  montarDocx,
  trocarTextos,
  CAMINHO_DO_TEXTO,
  DocxInvalido,
} from "./docx";
import {
  camposDoModelo,
  preencher,
  textoDoDocumento,
  ESPECIES,
  type Especie,
} from "./modelos";
import { MODELO_PADRAO, nomeDoArquivoPadrao } from "./modelos-padrao";

export { DocxInvalido };

/** Teto do modelo. Papel timbrado com imagem passa de 1 MB sem querer. */
export const TAMANHO_MAXIMO_MB = 5;

export class ModeloRecusado extends Error {
  readonly status = 422;
  constructor(motivo: string) {
    super(motivo);
    this.name = "ModeloRecusado";
  }
}

export class ModeloNaoEncontrado extends Error {
  readonly status = 404;
  constructor() {
    super("Modelo nao encontrado.");
    this.name = "ModeloNaoEncontrado";
  }
}

export function ehEspecie(valor: string): valor is Especie {
  return (ESPECIES as readonly string[]).includes(valor);
}

/**
 * Guarda o modelo que o escritorio enviou e o torna o vigente da especie.
 *
 * O anterior NAO e apagado: vira inativo. A peca que saiu ontem saiu daquele
 * texto, e um dia alguem vai perguntar qual era.
 */
export async function guardarModelo(
  escritorioId: string,
  especie: Especie,
  arquivo: { nome: string; conteudo: Buffer },
  enviadoPor: string | null = null,
): Promise<{ id: string; usados: string[]; desconhecidos: string[] }> {
  if (arquivo.conteudo.byteLength === 0) {
    throw new ModeloRecusado("O arquivo esta vazio.");
  }
  if (arquivo.conteudo.byteLength > TAMANHO_MAXIMO_MB * 1024 * 1024) {
    throw new ModeloRecusado(`O modelo passa de ${TAMANHO_MAXIMO_MB} MB.`);
  }

  // Abrir antes de gravar: modelo que o sistema nao consegue ler nao entra,
  // senao o erro so apareceria na hora de emitir a peca para o cliente.
  const partes = await lerTextos(arquivo.conteudo);
  const usados = new Set<string>();
  const desconhecidos = new Set<string>();
  for (const xml of Object.values(partes)) {
    const c = camposDoModelo(xml);
    c.usados.forEach((u) => usados.add(u));
    c.desconhecidos.forEach((d) => desconhecidos.add(d));
  }
  const campos = {
    usados: [...usados].sort(),
    desconhecidos: [...desconhecidos].sort(),
  };

  const anterior = await comEscritorio(escritorioId, (db) =>
    db.modeloDeDocumento.findFirst({ where: { especie, ativo: true } }),
  );
  if (anterior) {
    await comEscritorio(escritorioId, (db) =>
      db.modeloDeDocumento.update({
        where: { id: anterior.id },
        data: { ativo: false, substituidoEm: new Date() },
      }),
    );
  }

  const criado = await comEscritorio(escritorioId, (db) =>
    db.modeloDeDocumento.create({
      data: semEscritorio({
        especie,
        nomeDoArquivo: arquivo.nome.slice(0, 200),
        tamanhoBytes: arquivo.conteudo.byteLength,
        hash: "",
        campos: campos as unknown as Prisma.InputJsonValue,
        enviadoPor,
      }),
      select: { id: true },
    }),
  );

  const { hash } = await gravar(escritorioId, criado.id, arquivo.conteudo);
  await comEscritorio(escritorioId, (db) =>
    db.modeloDeDocumento.update({ where: { id: criado.id }, data: { hash } }),
  );

  return { id: criado.id, ...campos };
}

/**
 * Volta a usar o modelo que ja vem no sistema.
 *
 * O arquivo enviado some do disco: e papel do escritorio, e ele pediu para
 * tirar. O registro fica inativo, com o nome e a data, para a conferencia.
 */
export async function voltarAoPadrao(
  escritorioId: string,
  especie: Especie,
): Promise<void> {
  const atual = await comEscritorio(escritorioId, (db) =>
    db.modeloDeDocumento.findFirst({ where: { especie, ativo: true } }),
  );
  if (!atual) throw new ModeloNaoEncontrado();

  await comEscritorio(escritorioId, (db) =>
    db.modeloDeDocumento.update({
      where: { id: atual.id },
      data: { ativo: false, substituidoEm: new Date() },
    }),
  );
  await apagar(escritorioId, atual.id);
}

export type ModeloVigente = {
  especie: Especie;
  /** false quando e o que ja vem no sistema. */
  doEscritorio: boolean;
  id: string | null;
  nomeDoArquivo: string;
  usados: string[];
  desconhecidos: string[];
  enviadoEm: Date | null;
};

export async function modelosVigentes(escritorioId: string): Promise<ModeloVigente[]> {
  const ativos = await comEscritorio(escritorioId, (db) =>
    db.modeloDeDocumento.findMany({ where: { ativo: true } }),
  );
  const porEspecie = new Map(ativos.map((m) => [m.especie, m]));

  return ESPECIES.map((especie) => {
    const m = porEspecie.get(especie);
    if (!m) {
      return {
        especie,
        doEscritorio: false,
        id: null,
        nomeDoArquivo: nomeDoArquivoPadrao(especie),
        usados: [],
        desconhecidos: [],
        enviadoEm: null,
      };
    }
    const campos = (m.campos ?? {}) as { usados?: string[]; desconhecidos?: string[] };
    return {
      especie,
      doEscritorio: true,
      id: m.id,
      nomeDoArquivo: m.nomeDoArquivo,
      usados: campos.usados ?? [],
      desconhecidos: campos.desconhecidos ?? [],
      enviadoEm: m.criadoEm,
    };
  });
}

/** O .docx que vale hoje para a especie: o do escritorio, ou o do sistema. */
export async function arquivoDoModelo(
  escritorioId: string,
  especie: Especie,
): Promise<{ conteudo: Buffer; doEscritorio: boolean }> {
  const m = await comEscritorio(escritorioId, (db) =>
    db.modeloDeDocumento.findFirst({ where: { especie, ativo: true } }),
  );
  if (!m) {
    return { conteudo: await montarDocx(MODELO_PADRAO[especie]), doEscritorio: false };
  }
  return { conteudo: await ler(escritorioId, m.id), doEscritorio: true };
}

/** Como a forma aparece na peca: em portugues, nao em caixa alta de banco. */
const NOME_DA_FORMA: Record<string, string> = {
  BOLETO: "boleto",
  PIX: "Pix",
  CARTAO: "cartao",
  QUALQUER: "Pix, boleto ou cartao, a escolha do CONTRATANTE",
};

const MES = [
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho",
  "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function porExtensoData(d: Date): string {
  return `${d.getUTCDate()} de ${MES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

function emDia(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10).split("-").reverse().join("/") : null;
}

/**
 * O representante como vem do banco.
 *
 * `endereco` e coluna JSON, entao chega como `unknown`. A conversao fica aqui,
 * em um lugar so, em vez de cada rota empurrar um `as`.
 */
export type RepresentanteDoBanco = {
  nome: string;
  cpf: string;
  rg: string | null;
  nacionalidade: string | null;
  estadoCivil: string | null;
  profissao: string | null;
  mesmoEnderecoDaEmpresa: boolean;
  endereco: unknown;
};

type ParaQualificar = Parameters<typeof qualificacao>[0];

function comoRepresentante(r: RepresentanteDoBanco): ParaQualificar {
  return { ...r, endereco: (r.endereco ?? null) as ParaQualificar["endereco"] };
}

type Cliente = {
  nome: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  endereco: unknown;
};

/**
 * A qualificacao do cliente, como entra na peca.
 *
 * Pessoa fisica com o que houver no cadastro; pessoa juridica pelo
 * representante, porque quem assina por uma empresa e uma pessoa. O que nao
 * foi preenchido nao aparece — melhor uma qualificacao curta que uma com
 * "estado civil: ___" impresso.
 */
export function qualificacaoDoCliente(
  cliente: Cliente,
  representantes: RepresentanteDoBanco[] = [],
): string {
  const doc = cliente.documento ? formatarDocumento(cliente.documento) : null;
  const endereco = enderecoEmLinha((cliente.endereco ?? null) as never);

  const partes = [
    doc ? `inscrito no ${ehPessoaJuridica(cliente.documento) ? "CNPJ" : "CPF"} sob o nº ${doc}` : null,
    endereco ? `com endereco em ${endereco}` : null,
  ].filter(Boolean);

  const base = partes.length > 0 ? `${cliente.nome}, ${partes.join(", ")}` : cliente.nome;

  if (ehPessoaJuridica(cliente.documento) && representantes.length > 0) {
    const quem = representantes
      .map((r) => qualificacao(comoRepresentante(r), (cliente.endereco ?? null) as never))
      .join("; ");
    return `${base}, neste ato representada por ${quem}`;
  }
  return base;
}

export type DadosDaPeca = {
  cliente: Cliente;
  representantes?: RepresentanteDoBanco[];
  escritorio: {
    nome: string;
    cidade: string | null;
    telefoneAtendimento: string | null;
    razaoSocial?: string | null;
    cnpj?: string | null;
    registroOab?: string | null;
    enderecos?: unknown;
  };
  /** Quem assina a peca pelo escritorio. */
  advogados?: AdvogadoParaQualificar[];
  processo?: { numero: string; vara: string | null; tribunal: string | null } | null;
  contrato?: {
    forma?: string;
    tipo: string;
    valorCentavos: number | null;
    entradaCentavos: number | null;
    percentualBp: number | null;
    parcelas: number;
    primeiroVencimento: Date | null;
    descricao: string | null;
    ativo: boolean;
  } | null;
  /** So para o recibo: o que foi recebido. */
  recibo?: {
    valorCentavos: number;
    referenteA: string;
    forma: string | null;
    quando: Date;
  } | null;
  hoje?: Date;
};

/** Os valores de cada campo do modelo. null quando o cadastro nao tem. */
export function valoresDaPeca(d: DadosDaPeca): Record<string, string | null> {
  const hoje = d.hoje ?? new Date();
  const c = d.contrato ?? null;

  // O valor de cada parcela vem do mesmo calculo que emite a cobranca: o
  // contrato impresso e o boleto tem de dizer o mesmo numero.
  const plano = c
    ? planoDoContrato({
        tipo: c.tipo as "VALOR" | "PERCENTUAL" | "MISTO",
        valorCentavos: c.valorCentavos,
        entradaCentavos: c.entradaCentavos,
        percentualBp: c.percentualBp,
        parcelas: c.parcelas,
        primeiroVencimento: c.primeiroVencimento
          ? c.primeiroVencimento.toISOString().slice(0, 10)
          : null,
        descricao: c.descricao,
        ativo: c.ativo,
      })
    : null;
  const primeira = plano?.emiteSozinho ? plano.parcelas[0] : null;

  return {
    "cliente.nome": d.cliente.nome,
    "cliente.qualificacao": qualificacaoDoCliente(d.cliente, d.representantes ?? []),
    "cliente.documento": d.cliente.documento ? formatarDocumento(d.cliente.documento) : null,
    "cliente.endereco": enderecoEmLinha((d.cliente.endereco ?? null) as never) || null,
    "cliente.email": d.cliente.email,
    "cliente.telefone": d.cliente.telefone,
    "representante.qualificacao":
      (d.representantes ?? [])
        .map((r) => qualificacao(comoRepresentante(r), (d.cliente.endereco ?? null) as never))
        .join("; ") || null,
    "escritorio.nome": d.escritorio.nome,
    "escritorio.cidade": d.escritorio.cidade,
    "escritorio.telefone": d.escritorio.telefoneAtendimento,
    "escritorio.qualificacao": qualificacaoDoEscritorio(d.escritorio),
    "escritorio.cnpj": d.escritorio.cnpj ? formatarDocumento(d.escritorio.cnpj) : null,
    "escritorio.endereco": enderecoDaSede(sedeDe(d.escritorio.enderecos)) || null,
    "advogados.qualificacao": (d.advogados ?? []).length
      ? qualificacaoDosAdvogados(d.advogados!)
      : null,
    "advogados.assinaturas": (d.advogados ?? []).length
      ? linhasDeAssinatura(d.advogados!)
          .map((a) => `_______________________________\n${a.nome}${a.oab ? `\n${a.oab}` : ""}`)
          .join("\n\n")
      : null,
    "processo.numero": d.processo?.numero ?? null,
    "processo.vara": d.processo?.vara ?? null,
    "processo.tribunal": d.processo?.tribunal ?? null,
    "honorarios.valor": c?.valorCentavos ? emReais(c.valorCentavos) : null,
    "honorarios.valor_por_extenso": c?.valorCentavos ? porExtenso(c.valorCentavos) : null,
    "honorarios.parcelas": c ? String(c.parcelas) : null,
    "honorarios.parcela_valor": primeira ? emReais(primeira.valorCentavos) : null,
    "honorarios.percentual": c?.percentualBp ? percentualEmTexto(c.percentualBp) : null,
    "honorarios.descricao": c?.descricao ?? null,
    "honorarios.primeiro_vencimento": emDia(c?.primeiroVencimento ?? null),
    "honorarios.entrada": c?.entradaCentavos ? emReais(c.entradaCentavos) : null,
    "honorarios.forma": c?.forma ? (NOME_DA_FORMA[c.forma] ?? c.forma) : null,
    "honorarios.contratacao": c
      ? comoSeContrata({
          tipo: c.tipo as "VALOR" | "PERCENTUAL" | "MISTO",
          valorCentavos: c.valorCentavos,
          entradaCentavos: c.entradaCentavos,
          percentualBp: c.percentualBp,
          parcelas: c.parcelas,
          primeiroVencimento: null,
          descricao: null,
          ativo: c.ativo,
        })
      : null,
    "recibo.valor": d.recibo ? emReais(d.recibo.valorCentavos) : null,
    "recibo.valor_por_extenso": d.recibo ? porExtenso(d.recibo.valorCentavos) : null,
    "recibo.referente_a": d.recibo?.referenteA ?? null,
    "recibo.forma": d.recibo?.forma ?? null,
    "recibo.data": d.recibo ? emDia(d.recibo.quando) : null,
    "data.hoje": porExtensoData(hoje),
    "data.cidade_e_data": cidadeEData(d.escritorio.cidade, hoje),
  };
}

export type PecaPronta = {
  arquivo: Buffer;
  nomeDoArquivo: string;
  doEscritorio: boolean;
  semValor: string[];
  desconhecidos: string[];
  /** Texto corrido da peca, para a previa na tela. */
  texto: string;
};

/**
 * A peca pronta: o modelo vigente com os campos trocados.
 *
 * Devolve TAMBEM o que ficou sem valor e o que o sistema nao conhece. A tela
 * mostra isso antes do download: peca com buraco tem de ser vista antes de ir
 * para a mao do cliente, nao depois.
 */
export async function gerarPeca(
  escritorioId: string,
  especie: Especie,
  dados: DadosDaPeca,
): Promise<PecaPronta> {
  const { conteudo, doEscritorio } = await arquivoDoModelo(escritorioId, especie);
  const valores = valoresDaPeca(dados);

  // Cabecalho e rodape sao arquivos proprios dentro do .docx, e e justamente
  // onde mora o timbre. Preencher so o corpo deixaria `{{...}}` impresso no
  // alto da folha.
  const partes = await lerTextos(conteudo);
  const novas: Record<string, string> = {};
  const semValor = new Set<string>();
  const desconhecidos = new Set<string>();
  for (const [nome, xml] of Object.entries(partes)) {
    const r = preencher(xml, valores);
    novas[nome] = r.xml;
    r.semValor.forEach((s) => semValor.add(s));
    r.desconhecidos.forEach((d) => desconhecidos.add(d));
  }
  const arquivo = await trocarTextos(conteudo, novas);

  const limpo = dados.cliente.nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 40);

  return {
    arquivo,
    nomeDoArquivo: `${especie.toLowerCase()}-${limpo || "cliente"}.docx`,
    doEscritorio,
    semValor: [...semValor].sort(),
    desconhecidos: [...desconhecidos].sort(),
    texto: textoDoDocumento(novas[CAMINHO_DO_TEXTO]),
  };
}
