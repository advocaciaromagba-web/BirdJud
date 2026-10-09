// A nuvem do escritorio: OneDrive ou Google Drive, a escolha dele.
//
// Cada escritorio conecta a PROPRIA conta. A plataforma tem um aplicativo
// registrado em cada provedor (variaveis MICROSOFT_* e GOOGLE_*), e o
// escritorio so autoriza esse aplicativo a mexer na conta dele. O que fica
// guardado, cifrado, e o token de renovacao — nunca a senha.
//
// Depois de conectar, nada e configurado a mao:
//
//   BirdJud/                     <- criada na hora da conexao
//     Clientes/
//       Maria Silva - 123.456.789-00/   <- uma por cliente, pela rotina
//         2026-10-09 - procuracao.pdf   <- copia do que foi anexado no sistema
//
// A copia e de mao unica e nunca derruba nada: documento anexado fica no
// sistema de qualquer jeito; a nuvem e o lugar onde o escritorio o ve junto
// com o resto dos arquivos dele.
import { comEscritorio, semEscritorio } from "./prisma";
import {
  anotarTeste,
  apagarIntegracao,
  obterIntegracao,
  salvarIntegracao,
  IntegracaoAusente,
} from "./integracao";
import * as disco from "./armazenamento";
import {
  FalhaNaNuvem,
  NUVENS,
  PROVEDORES,
  nomeSeguro,
  type Nuvem,
  type Pasta,
  type Provedor,
} from "./nuvem";

export const PASTA_RAIZ = "BirdJud";
export const PASTA_CLIENTES = "Clientes";

/** O que fica guardado (cifrado) na Integracao do provedor. */
export type DadosDaNuvem = {
  renovacao: string;
  conta: string | null;
  raizId: string;
  raizEndereco: string | null;
  clientesId: string;
  conectadaEm: string;
};

export class OutraNuvemConectada extends Error {
  readonly status = 409;
  constructor(atual: Provedor) {
    super(
      `O escritorio ja tem o ${NUVENS[atual].rotulo} conectado. Desconecte-o antes de ligar outra nuvem: os documentos de cada cliente ficam em um lugar so.`,
    );
    this.name = "OutraNuvemConectada";
  }
}

/** "Maria Silva - 123.456.789-00": o documento separa as duas Marias Silva. */
export function nomeDaPastaDoCliente(c: { nome: string; documento: string | null }): string {
  return nomeSeguro(c.documento ? `${c.nome} - ${c.documento}` : c.nome);
}

/** "2026-10-09 - procuracao.pdf": a data na frente deixa a pasta em ordem. */
export function nomeNaNuvem(nome: string, criadoEm: Date): string {
  const dia = criadoEm.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return nomeSeguro(`${dia} - ${nome}`);
}

/** Qual nuvem o escritorio conectou, se alguma. */
export async function nuvemConectada(
  escritorioId: string,
): Promise<{ provedor: Provedor; status: string } | null> {
  const linha = await comEscritorio(escritorioId, (db) =>
    db.integracao.findFirst({
      where: { tipo: { in: [...PROVEDORES] } },
      select: { tipo: true, status: true },
    }),
  );
  return linha ? { provedor: linha.tipo as Provedor, status: linha.status } : null;
}

type Sessao = { nuvem: Nuvem; provedor: Provedor; dados: DadosDaNuvem; acesso: string };

/**
 * Abre a conversa com a nuvem: troca o token de renovacao por um de acesso.
 *
 * Se o provedor mandar um token de renovacao novo, ele e guardado na hora —
 * a Microsoft troca de vez em quando, e quem continua usando o velho perde o
 * acesso semanas depois, sem aviso. Acesso revogado marca a integracao com
 * ERRO, para a tela pedir que reconecte.
 */
async function abrir(escritorioId: string): Promise<Sessao | null> {
  const ligada = await nuvemConectada(escritorioId);
  if (!ligada) return null;
  const { provedor } = ligada;
  const nuvem = NUVENS[provedor];
  if (!nuvem.configurada()) return null;

  let dados: DadosDaNuvem;
  try {
    dados = await obterIntegracao<DadosDaNuvem>(escritorioId, provedor);
  } catch (erro) {
    if (erro instanceof IntegracaoAusente) return null; // com ERRO: espera reconectar
    throw erro;
  }

  try {
    const tokens = await nuvem.renovar(dados.renovacao);
    if (tokens.renovacao) {
      dados = { ...dados, renovacao: tokens.renovacao };
      await salvarIntegracao(escritorioId, provedor, dados, "OK");
    }
    return { nuvem, provedor, dados, acesso: tokens.acesso };
  } catch (erro) {
    if (erro instanceof FalhaNaNuvem && erro.precisaReconectar) {
      await anotarTeste(escritorioId, provedor, false, erro.message);
      return null;
    }
    throw erro;
  }
}

/** Cria (ou reencontra) BirdJud/Clientes na conta. */
async function montarEstrutura(nuvem: Nuvem, acesso: string): Promise<{ raiz: Pasta; clientes: Pasta }> {
  const raiz = await nuvem.garantirPasta(acesso, null, PASTA_RAIZ);
  const clientes = await nuvem.garantirPasta(acesso, raiz.id, PASTA_CLIENTES);
  return { raiz, clientes };
}

/**
 * Conclui a conexao: troca o codigo, monta a estrutura de pastas e guarda.
 *
 * E a "configuracao automatica": o escritorio so escolheu a conta. Se a pasta
 * BirdJud ja existir (reconexao), e reaproveitada, nao duplicada.
 */
export async function conectarNuvem(
  escritorioId: string,
  provedor: Provedor,
  codigo: string,
  retorno: string,
): Promise<{ conta: string | null; endereco: string | null }> {
  const outra = await nuvemConectada(escritorioId);
  if (outra && outra.provedor !== provedor) throw new OutraNuvemConectada(outra.provedor);

  const nuvem = NUVENS[provedor];
  const conta = await nuvem.trocarCodigo(codigo, retorno);
  const tokens = await nuvem.renovar(conta.renovacao);
  const { raiz, clientes } = await montarEstrutura(nuvem, tokens.acesso);

  const dados: DadosDaNuvem = {
    renovacao: tokens.renovacao ?? conta.renovacao,
    conta: conta.conta,
    raizId: raiz.id,
    raizEndereco: raiz.endereco,
    clientesId: clientes.id,
    conectadaEm: new Date().toISOString(),
  };
  await salvarIntegracao(escritorioId, provedor, dados, "OK");

  // Reconectando o mesmo provedor com OUTRA conta, as pastas antigas
  // apontam para a conta errada. Recomecar o mapa e o seguro; a rotina
  // reencontra pelo nome as que ja existirem na conta nova.
  await comEscritorio(escritorioId, async (db) => {
    await db.pastaNaNuvem.deleteMany({ where: { provedor } });
    await db.arquivo.updateMany({
      where: { nuvemProvedor: provedor },
      data: { nuvemProvedor: null, nuvemItemId: null },
    });
  });

  return { conta: conta.conta, endereco: raiz.endereco };
}

/**
 * Desconecta: apaga o token e o mapa de pastas. Os arquivos que ja estao na
 * nuvem FICAM la — sao do escritorio, na conta dele.
 */
export async function desconectarNuvem(escritorioId: string, provedor: Provedor): Promise<void> {
  await apagarIntegracao(escritorioId, provedor);
  await comEscritorio(escritorioId, async (db) => {
    await db.pastaNaNuvem.deleteMany({ where: { provedor } });
    await db.arquivo.updateMany({
      where: { nuvemProvedor: provedor },
      data: { nuvemProvedor: null, nuvemItemId: null },
    });
  });
}

/** Pasta Clientes ainda existe? Se alguem apagou, monta de novo e guarda. */
async function pastaDosClientes(escritorioId: string, s: Sessao): Promise<string> {
  const viva = await s.nuvem.pastaExiste(s.acesso, s.dados.clientesId);
  if (viva) return viva.id;
  const { raiz, clientes } = await montarEstrutura(s.nuvem, s.acesso);
  s.dados = { ...s.dados, raizId: raiz.id, raizEndereco: raiz.endereco, clientesId: clientes.id };
  await salvarIntegracao(escritorioId, s.provedor, s.dados, "OK");
  // As pastas de cliente estavam dentro da que sumiu.
  await comEscritorio(escritorioId, (db) =>
    db.pastaNaNuvem.deleteMany({ where: { provedor: s.provedor } }),
  );
  return clientes.id;
}

async function criarPastaDoCliente(
  escritorioId: string,
  s: Sessao,
  clientesId: string,
  cliente: { id: string; nome: string; documento: string | null },
): Promise<Pasta> {
  const pasta = await s.nuvem.garantirPasta(s.acesso, clientesId, nomeDaPastaDoCliente(cliente));
  await comEscritorio(escritorioId, (db) =>
    db.pastaNaNuvem.upsert({
      where: {
        escritorioId_provedor_clienteId: { escritorioId, provedor: s.provedor, clienteId: cliente.id },
      },
      create: semEscritorio({
        clienteId: cliente.id,
        provedor: s.provedor,
        pastaId: pasta.id,
        endereco: pasta.endereco,
      }),
      update: { pastaId: pasta.id, endereco: pasta.endereco },
    }),
  );
  return pasta;
}

/**
 * Cria a pasta de todo cliente que ainda nao tem. Idempotente: rodar de novo
 * so cria o que falta. Devolve quantos faltam, para a rotina se reagendar.
 */
export async function organizarPastas(
  escritorioId: string,
  limite = 100,
): Promise<{ criadas: number; restantes: number; conectada: boolean }> {
  const s = await abrir(escritorioId);
  if (!s) return { criadas: 0, restantes: 0, conectada: false };

  const clientesId = await pastaDosClientes(escritorioId, s);
  const semPasta = await comEscritorio(escritorioId, (db) =>
    db.cliente.findMany({
      where: { pastasNaNuvem: { none: { provedor: s.provedor } } },
      select: { id: true, nome: true, documento: true },
      orderBy: { criadoEm: "asc" },
      take: limite + 1,
    }),
  );

  let criadas = 0;
  for (const cliente of semPasta.slice(0, limite)) {
    await criarPastaDoCliente(escritorioId, s, clientesId, cliente);
    criadas += 1;
  }
  return { criadas, restantes: Math.max(0, semPasta.length - limite), conectada: true };
}

/** A pasta do cliente na nuvem, criando se preciso. Null sem nuvem conectada. */
export async function pastaDoCliente(
  escritorioId: string,
  clienteId: string,
): Promise<{ endereco: string | null; provedor: Provedor } | null> {
  const s = await abrir(escritorioId);
  if (!s) return null;
  return { endereco: (await pastaViva(escritorioId, s, clienteId)).endereco, provedor: s.provedor };
}

async function pastaViva(escritorioId: string, s: Sessao, clienteId: string): Promise<Pasta> {
  const { mapa, cliente } = await comEscritorio(escritorioId, async (db) => ({
    mapa: await db.pastaNaNuvem.findFirst({ where: { clienteId, provedor: s.provedor } }),
    cliente: await db.cliente.findFirst({
      where: { id: clienteId },
      select: { id: true, nome: true, documento: true },
    }),
  }));
  if (!cliente) throw new FalhaNaNuvem("Cliente nao encontrado.", 404);

  if (mapa) {
    const viva = await s.nuvem.pastaExiste(s.acesso, mapa.pastaId);
    if (viva) return viva;
  }
  const clientesId = await pastaDosClientes(escritorioId, s);
  return criarPastaDoCliente(escritorioId, s, clientesId, cliente);
}

/**
 * Copia para a pasta do cliente um documento anexado no sistema.
 *
 * So documento ligado a cliente: o resto nao tem pasta onde morar. Ja
 * copiado nao copia de novo. Pasta apagada na nuvem e recriada.
 */
export async function espelharArquivo(
  escritorioId: string,
  arquivoId: string,
): Promise<"copiado" | "ja-copiado" | "sem-cliente" | "sem-nuvem" | "sumiu"> {
  const arquivo = await comEscritorio(escritorioId, (db) =>
    db.arquivo.findFirst({ where: { id: arquivoId } }),
  );
  if (!arquivo) return "sumiu";
  if (!arquivo.clienteId) return "sem-cliente";

  const s = await abrir(escritorioId);
  if (!s) return "sem-nuvem";
  if (arquivo.nuvemProvedor === s.provedor && arquivo.nuvemItemId) return "ja-copiado";

  const conteudo = await disco.ler(escritorioId, arquivo.id);
  const nome = nomeNaNuvem(arquivo.nome, arquivo.criadoEm);
  const pasta = await pastaViva(escritorioId, s, arquivo.clienteId);
  const enviado = await s.nuvem.enviar(s.acesso, pasta.id, nome, arquivo.tipo, conteudo);

  await comEscritorio(escritorioId, (db) =>
    db.arquivo.update({
      where: { id: arquivo.id },
      data: { nuvemProvedor: s.provedor, nuvemItemId: enviado.id || "copiado" },
    }),
  );
  return "copiado";
}

/** Arquivos de cliente que ainda nao foram para a nuvem — para a rotina. */
export async function arquivosParaEspelhar(escritorioId: string, limite = 50): Promise<string[]> {
  const ligada = await nuvemConectada(escritorioId);
  if (!ligada) return [];
  const linhas = await comEscritorio(escritorioId, (db) =>
    db.arquivo.findMany({
      where: {
        clienteId: { not: null },
        tamanhoBytes: { gt: 0 },
        OR: [{ nuvemProvedor: null }, { nuvemProvedor: { not: ligada.provedor } }],
      },
      select: { id: true },
      orderBy: { criadoEm: "asc" },
      take: limite,
    }),
  );
  return linhas.map((l) => l.id);
}

/** O teste do botao "Testar" da tela de integracoes. */
export async function testarNuvem(escritorioId: string): Promise<{ ok: boolean; detalhe: string }> {
  try {
    const s = await abrir(escritorioId);
    if (!s) {
      return { ok: false, detalhe: "A conta nao esta respondendo: conecte de novo pela Microsoft ou pelo Google." };
    }
    const raiz = await s.nuvem.pastaExiste(s.acesso, s.dados.raizId);
    if (!raiz) {
      await pastaDosClientes(escritorioId, s);
      return { ok: true, detalhe: `A pasta ${PASTA_RAIZ} tinha sumido e foi criada de novo no ${s.nuvem.rotulo}.` };
    }
    return { ok: true, detalhe: `${s.nuvem.rotulo} respondendo${s.dados.conta ? ` na conta ${s.dados.conta}` : ""}.` };
  } catch (erro) {
    return { ok: false, detalhe: erro instanceof Error ? erro.message : "Falha desconhecida." };
  }
}

export type ResumoDaNuvem = {
  provedor: Provedor;
  rotulo: string;
  conta: string | null;
  endereco: string | null;
  pastas: number;
  copiados: number;
  status: string;
};

/** Para a tela: qual conta, o link da pasta BirdJud e o que ja foi feito. */
export async function resumoDaNuvem(escritorioId: string): Promise<ResumoDaNuvem | null> {
  const ligada = await nuvemConectada(escritorioId);
  if (!ligada) return null;
  const dados = await obterIntegracao<DadosDaNuvem>(escritorioId, ligada.provedor, { mesmoComErro: true });
  const { pastas, copiados } = await comEscritorio(escritorioId, async (db) => ({
    pastas: await db.pastaNaNuvem.count({ where: { provedor: ligada.provedor } }),
    copiados: await db.arquivo.count({ where: { nuvemProvedor: ligada.provedor } }),
  }));
  return {
    provedor: ligada.provedor,
    rotulo: NUVENS[ligada.provedor].rotulo,
    conta: dados.conta,
    endereco: dados.raizEndereco,
    pastas,
    copiados,
    status: ligada.status,
  };
}
