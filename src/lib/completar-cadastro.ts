// Completar o cadastro do cliente lendo, por IA, os documentos que o
// escritorio ja guardou dele (15/11/2026, vindo do sistema da Advocacia
// Roma). As travas moram em cadastro-pelos-documentos.ts; aqui e so a ida ao
// banco, ao disco e a IA.
import { comEscritorio, semEscritorio } from "./prisma";
import * as disco from "./armazenamento";
import { registrarConsumo } from "./consumo";
import { MAXIMO_DE_ANEXOS, MAXIMO_DE_BYTES, milTokens, pedirSobreDocumentos, TIPOS_QUE_A_IA_LE, type Anexo } from "./ia";
import { interpretar, montarInstrucao } from "./leitura-documento";
import {
  camposFaltando,
  decidirPreenchimento,
  instrucaoDaPasta,
  motivoDeNaoSerDoCliente,
  type CampoCompletavel,
} from "./cadastro-pelos-documentos";
import { escolherDocumentos } from "./documentos-do-cliente";

const LIMITES = { maximo: MAXIMO_DE_ANEXOS, bytes: MAXIMO_DE_BYTES, tiposLidos: (tipo: string) => tipo in TIPOS_QUE_A_IA_LE };

const SISTEMA =
  "Você é um assistente de cadastro de um escritório de advocacia. " +
  "Você lê documentos e devolve só o que está escrito neles; na dúvida, não devolve.";

const DO_CADASTRO = {
  id: true,
  nome: true,
  documento: true,
  rg: true,
  nascimento: true,
  nacionalidade: true,
  estadoCivil: true,
  profissao: true,
  endereco: true,
  camposLidosPorIA: true,
} as const;

export type CadastroIncompleto = { id: string; nome: string; falta: CampoCompletavel[]; documentos: number };

/** Quem esta com o cadastro pela metade, e quantos documentos dele a IA poderia ler. */
export async function cadastrosIncompletos(escritorioId: string): Promise<CadastroIncompleto[]> {
  const clientes = await comEscritorio(escritorioId, (db) =>
    db.cliente.findMany({
      orderBy: { nome: "asc" },
      take: 1000,
      select: { ...DO_CADASTRO, arquivos: { select: { id: true, nome: true, tipo: true, tamanhoBytes: true } } },
    }),
  );
  return clientes
    .map((c) => ({ id: c.id, nome: c.nome, falta: camposFaltando(c), documentos: escolherDocumentos(c.arquivos, LIMITES).escolhidos.length }))
    .filter((c) => c.falta.length > 0);
}

export type ResultadoDeCompletar =
  | { situacao: "COMPLETO" | "SEM_DOCUMENTOS" | "NAO_E_DO_CLIENTE" | "NADA_LIDO"; recado: string; lidos: string[] }
  | {
      situacao: "PREENCHIDO";
      recado: string;
      lidos: string[];
      preenchidos: { campo: CampoCompletavel; origem: string | null }[];
      recusados: { campo: CampoCompletavel; motivo: string }[];
      aindaFalta: CampoCompletavel[];
    };

export class ClienteNaoEncontrado extends Error {
  readonly status = 404;
  constructor() {
    super("Cliente não encontrado.");
  }
}

export async function completarPelosDocumentos(escritorioId: string, clienteId: string, usuarioId: string): Promise<ResultadoDeCompletar> {
  const cliente = await comEscritorio(escritorioId, (db) =>
    db.cliente.findFirst({
      where: { id: clienteId },
      select: { ...DO_CADASTRO, arquivos: { orderBy: { criadoEm: "desc" }, select: { id: true, nome: true, tipo: true, tamanhoBytes: true } } },
    }),
  );
  if (!cliente) throw new ClienteNaoEncontrado();
  if (camposFaltando(cliente).length === 0) return { situacao: "COMPLETO", recado: "O cadastro já está completo.", lidos: [] };

  const { escolhidos } = escolherDocumentos(cliente.arquivos, LIMITES);
  const anexos: Anexo[] = [];
  for (const a of escolhidos) {
    // Arquivo que nao abre (antigo, corrompido) nao derruba a leitura dos outros.
    const dados = await disco.ler(escritorioId, a.id).catch(() => null);
    if (dados?.byteLength) anexos.push({ nome: a.nome, tipo: a.tipo, dados });
  }
  if (anexos.length === 0) {
    return {
      situacao: "SEM_DOCUMENTOS",
      recado: "Não há documento deste cliente que sirva para a leitura (RG, CNH, comprovante de endereço, procuração, contrato). Guarde um em Arquivos, ligado a ele.",
      lidos: [],
    };
  }
  const lidos = anexos.map((a) => a.nome);

  const resultado = await pedirSobreDocumentos(SISTEMA, anexos, montarInstrucao("CLIENTE") + "\n" + instrucaoDaPasta(cliente.nome), "medium");
  const leitura = interpretar("CLIENTE", resultado.texto);
  await comEscritorio(escritorioId, (db) =>
    db.analiseIA.create({
      data: semEscritorio({
        usuarioId,
        tipo: "LEITURA_CADASTRO",
        modelo: resultado.modelo,
        resultado: JSON.stringify({ clienteId, lidos, leitura }),
        tokensEntrada: resultado.tokensEntrada,
        tokensSaida: resultado.tokensSaida,
      }),
    }),
  );
  await registrarConsumo(escritorioId, "IA_MIL_TOKENS", milTokens(resultado.tokensEntrada, resultado.tokensSaida));

  const motivo = motivoDeNaoSerDoCliente(cliente, leitura);
  if (motivo) return { situacao: "NAO_E_DO_CLIENTE", recado: motivo, lidos };

  const decisao = decidirPreenchimento(cliente, leitura);
  const campos = Object.keys(decisao.preencher) as CampoCompletavel[];
  if (campos.length === 0) {
    return {
      situacao: "NADA_LIDO",
      recado: decisao.recusados.length
        ? `Nada entrou: ${decisao.recusados.map((r) => r.motivo).join("; ")}.`
        : "Os documentos não trazem o que falta no cadastro.",
      lidos,
    };
  }

  // Gravado sobre o cadastro COMO ESTA AGORA: alguem pode ter digitado um
  // campo enquanto a IA lia, e o que foi digitado ganha.
  const gravados = await comEscritorio(escritorioId, async (db) => {
    const agora = await db.cliente.findFirst({ where: { id: clienteId }, select: DO_CADASTRO });
    if (!agora) return [] as CampoCompletavel[];
    const ainda = new Set(camposFaltando(agora));
    const entram = campos.filter((c) => ainda.has(c));
    if (entram.length === 0) return entram;
    const { endereco, nascimento, ...texto } = decisao.preencher;
    const dados: Record<string, unknown> = {};
    for (const [campo, valor] of Object.entries(texto)) if (ainda.has(campo as CampoCompletavel)) dados[campo] = valor;
    if (nascimento && ainda.has("nascimento")) dados.nascimento = new Date(`${nascimento}T00:00:00Z`);
    if (endereco && ainda.has("endereco")) {
      // Por cima do que havia (um CEP solto, por exemplo), e a rua nos dois
      // nomes que o codigo usa.
      dados.endereco = { ...((agora.endereco ?? {}) as Record<string, unknown>), ...endereco, rua: endereco.logradouro };
    }
    dados.camposLidosPorIA = [...new Set([...agora.camposLidosPorIA, ...entram])];
    await db.cliente.updateMany({ where: { id: clienteId }, data: dados });
    return entram;
  });

  const depois = await comEscritorio(escritorioId, (db) => db.cliente.findFirst({ where: { id: clienteId }, select: DO_CADASTRO }));
  return {
    situacao: "PREENCHIDO",
    recado: `${gravados.length} campo(s) preenchido(s). Confira na ficha: dado lido por IA é sugestão até alguém conferir.`,
    lidos,
    preenchidos: gravados.map((campo) => ({ campo, origem: decisao.origem[campo] ?? null })),
    recusados: decisao.recusados,
    aindaFalta: depois ? camposFaltando(depois) : [],
  };
}
