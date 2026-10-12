// NFS-e em dois tempos — o metodo do sistema da Advocacia Roma, que ja emite
// nota real em producao:
//
//   1. alguem da equipe PREPARA a nota (fica AGUARDANDO_ASSINATURA). Nada vai
//      para a Receita e nenhum numero de DPS e gasto aqui. O tomador ja e
//      conferido agora, para o erro de cadastro aparecer para quem preparou;
//   2. o titular do certificado ASSINA com o e-CNPJ, digitando a senha na
//      hora (ela NAO fica guardada) — so ai a DPS ganha numero, e assinada,
//      transmitida e o resultado registrado.
//
// Recusada, a nota volta a lista para corrigir o cadastro e assinar de novo
// (com numero novo). Conexao que cai depois do envio deixa a nota
// PROCESSANDO, e "Verificar situacao" pergunta a Sefin pela DPS.
import type { Cliente, Fiscal, NotaFiscal } from "@prisma/client";
import { comEscritorio, semEscritorio } from "../prisma";
import { IntegracaoAusente, obterIntegracao } from "../integracao";
import { registrarConsumo } from "../consumo";
import { buscarCep } from "../cep";
import { carregarDeBase64, type CertificadoCarregado } from "./certificado";
import { assinarXml } from "./assinar";
import { montarDps, montarPedidoCancelamento, type MotivoDeCancelamento, type TomadorDps } from "./dps";
import { consultarDps, consultarNfse, enviarDps, enviarEvento, type Ambiente, type ErroApi } from "./api";
import { lerNfse } from "./ler-xml";
import { ibsCbsVigente, lerRegimeFuturo, pendenciasDoIbsCbs, pendenciasDoRegime, regimeAtual, regimeVigente } from "./regime";

// ---------------------------------------------------------------------------
// Erros que chegam a tela
// ---------------------------------------------------------------------------

export class NotaInvalida extends Error {
  readonly status: number;
  constructor(motivo: string, status = 400) {
    super(motivo);
    this.name = "NotaInvalida";
    this.status = status;
  }
}

export class SemCadastroFiscal extends NotaInvalida {
  constructor() {
    super("Preencha o cadastro fiscal antes da primeira nota.", 428);
    this.name = "SemCadastroFiscal";
  }
}

export class SemCertificado extends NotaInvalida {
  constructor() {
    super("O certificado e-CNPJ ainda nao foi cadastrado em Notas fiscais.", 428);
    this.name = "SemCertificado";
  }
}

export class SoOTitular extends NotaInvalida {
  constructor(titular: string) {
    super(`So ${titular}, titular do certificado, assina, cancela ou consulta com ele.`, 403);
    this.name = "SoOTitular";
  }
}

// ---------------------------------------------------------------------------
// O certificado guardado
// ---------------------------------------------------------------------------

/**
 * O que fica em Integracoes (NFSE_CERT), cifrado. A senha NAO: o titular
 * digita a cada assinatura. `senha` so existe em certificado cadastrado antes
 * deste fluxo e nao e mais usada.
 */
export type CertificadoGuardado = {
  arquivo: string;
  titular?: string;
  cnpj?: string | null;
  validoAte?: string;
  /** Usuario do escritorio dono do certificado: so ele assina. */
  titularId?: string | null;
  titularNome?: string | null;
};

export async function certificadoGuardado(escritorioId: string): Promise<CertificadoGuardado | null> {
  try {
    return await obterIntegracao<CertificadoGuardado>(escritorioId, "NFSE_CERT");
  } catch (erro) {
    if (erro instanceof IntegracaoAusente) return null;
    throw erro;
  }
}

/** Quem pode usar o certificado: o titular; sem titular gravado, um administrador. */
function exigirTitular(cert: CertificadoGuardado, quem: { usuarioId: string; papel: string }) {
  if (cert.titularId) {
    if (cert.titularId !== quem.usuarioId) throw new SoOTitular(cert.titularNome ?? "o(a) advogado(a)");
    return;
  }
  if (quem.papel !== "ADMIN") throw new SoOTitular("um administrador");
}

/** Abre o e-CNPJ com a senha digitada agora. */
export async function abrirCertificadoDoEscritorio(
  escritorioId: string,
  quem: { usuarioId: string; papel: string },
  senha: string,
): Promise<CertificadoCarregado> {
  const cert = await certificadoGuardado(escritorioId);
  if (!cert) throw new SemCertificado();
  exigirTitular(cert, quem);
  if (!senha) throw new NotaInvalida("Digite a senha do certificado para assinar.");
  try {
    return carregarDeBase64(cert.arquivo, senha);
  } catch {
    throw new NotaInvalida("Senha do certificado incorreta.");
  }
}

// ---------------------------------------------------------------------------
// Pendencias
// ---------------------------------------------------------------------------

/**
 * O que falta para conseguir emitir — vazio quando esta pronto. Sem
 * `competencia`, cobra tambem o regime futuro ja cadastrado (e o que a tela
 * mostra); com `competencia`, cobra so o regime que vale para aquela nota,
 * para uma pendencia de 2027 nao travar nota de hoje.
 */
export function pendenciasDoEmissor(
  fiscal: Fiscal | null,
  cert: CertificadoGuardado | null,
  competencia?: Date,
): string[] {
  if (!fiscal) return ["Preencher o cadastro fiscal do escritorio."];
  const p: string[] = [];
  const cnpj = fiscal.cnpj.replace(/\D/g, "");
  if (!cert) p.push("Cadastrar o certificado digital A1 e-CNPJ do escritorio.");
  else if (cert.cnpj && cert.cnpj !== cnpj) {
    p.push("O certificado cadastrado e de outro CNPJ — a API recusa (rejeicao E0718).");
  } else if (cert.cnpj === null) {
    p.push("O certificado cadastrado e e-CPF — a API so aceita o e-CNPJ do proprio escritorio (rejeicao E0718).");
  }
  if (cert?.validoAte && new Date(cert.validoAte) < new Date()) p.push("O certificado digital esta vencido.");
  if (!/^\d{7}$/.test(fiscal.codigoMunicipio)) p.push("Informar o codigo IBGE do municipio (7 digitos).");
  p.push(...pendenciasDoIbsCbs(fiscal));
  if (competencia) {
    p.push(...pendenciasDoRegime(regimeVigente(fiscal, competencia), ""));
    return p;
  }
  p.push(...pendenciasDoRegime(regimeAtual(fiscal), ""));
  const futuro = lerRegimeFuturo(fiscal);
  if (futuro && fiscal.regimeFuturoDesde) {
    const desde = fiscal.regimeFuturoDesde.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    p.push(...pendenciasDoRegime(futuro, ` a partir de ${desde}`));
  }
  return p;
}

// ---------------------------------------------------------------------------
// Tomador
// ---------------------------------------------------------------------------

type EnderecoDoCadastro = {
  cep?: string;
  logradouro?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
};

/** Tomador da nota a partir do cadastro do cliente. O municipio sai do CEP. */
export async function tomadorDoCliente(cliente: Cliente): Promise<{ tomador: TomadorDps; avisos: string[] }> {
  const avisos: string[] = [];
  const doc = (cliente.documento ?? "").replace(/\D/g, "");
  const e = (cliente.endereco ?? {}) as EnderecoDoCadastro;
  const rua = (e.logradouro ?? e.rua ?? "").trim();
  const temEndereco = Boolean(rua && e.numero?.trim() && e.bairro?.trim() && e.cep?.trim());
  let endereco: TomadorDps["endereco"] = null;

  if (temEndereco) {
    // A API confere se o CEP pertence ao municipio.
    const achado = await buscarCep(e.cep!).catch(() => null);
    if (achado?.ibge) {
      endereco = {
        codigoMunicipio: achado.ibge,
        cep: e.cep!,
        logradouro: rua,
        numero: e.numero!.trim(),
        complemento: e.complemento?.trim() || null,
        bairro: e.bairro!.trim(),
      };
    } else {
      avisos.push("Nao foi possivel confirmar o municipio pelo CEP do cliente — a nota sai sem o endereco do tomador.");
    }
  }
  if (doc.length === 14 && !endereco) {
    throw new NotaInvalida(
      "Tomador empresa (CNPJ) precisa de endereco completo com CEP valido na nota (regra E0235). Complete o cadastro do cliente.",
    );
  }
  if (doc.length !== 11 && doc.length !== 14) {
    avisos.push("Cliente sem CPF/CNPJ no cadastro — a nota sai sem identificar o tomador pelo documento.");
  }

  return {
    tomador: { documento: doc || null, nome: cliente.nome, email: cliente.email, telefone: cliente.telefone, endereco },
    avisos,
  };
}

function hojeEmSaoPaulo(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

const competenciaISO = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

// ---------------------------------------------------------------------------
// Preparar
// ---------------------------------------------------------------------------

export type PedidoDeNota = {
  clienteId: string;
  valorCentavos: number;
  descricao: string;
  /** AAAA-MM-DD — quando o servico foi prestado. Vazio: hoje. */
  dataCompetencia?: string | null;
  informacoesComplementares?: string | null;
  criadoPorId: string;
  cobrancaId?: string | null;
  /** Canais para mandar a nota ao cliente assim que for emitida. */
  envioCliente?: ("EMAIL" | "WHATSAPP")[];
};

/**
 * Prepara a nota e a deixa AGUARDANDO_ASSINATURA. Qualquer pessoa com acesso
 * a area prepara; nada vai para a Receita/prefeitura e nenhum numero de DPS e
 * gasto aqui.
 */
export async function prepararNota(
  escritorioId: string,
  p: PedidoDeNota,
): Promise<{ nota: NotaFiscal; avisos: string[]; titularId: string | null }> {
  const fiscal = await comEscritorio(escritorioId, (db) => db.fiscal.findFirst());
  if (!fiscal) throw new SemCadastroFiscal();

  const cliente = await comEscritorio(escritorioId, (db) => db.cliente.findFirst({ where: { id: p.clienteId } }));
  if (!cliente) throw new NotaInvalida("Cliente nao encontrado.");
  if (!(p.valorCentavos > 0)) throw new NotaInvalida("Informe o valor do servico.");
  const descricao = p.descricao.trim();
  if (!descricao) throw new NotaInvalida("Descreva o servico prestado.");
  if (descricao.length > 2000) throw new NotaInvalida("A descricao do servico passa de 2.000 caracteres.");

  const competencia =
    p.dataCompetencia && /^\d{4}-\d{2}-\d{2}$/.test(p.dataCompetencia) ? p.dataCompetencia : hojeEmSaoPaulo();
  if (competencia > hojeEmSaoPaulo()) throw new NotaInvalida("A data de competencia nao pode ser futura (regra E0015).");

  const { tomador, avisos } = await tomadorDoCliente(cliente);
  const canais = (p.envioCliente ?? []).filter((c) => c === "EMAIL" || c === "WHATSAPP");

  const nota = await comEscritorio(escritorioId, (db) =>
    db.notaFiscal.create({
      data: semEscritorio({
        clienteId: cliente.id,
        cobrancaId: p.cobrancaId ?? null,
        status: "AGUARDANDO_ASSINATURA",
        ambiente: fiscal.ambiente,
        serie: fiscal.serie,
        dataCompetencia: new Date(`${competencia}T12:00:00-03:00`),
        valorCentavos: p.valorCentavos,
        descricao,
        informacoesComplementares: p.informacoesComplementares?.trim() || null,
        tomadorNome: tomador.nome,
        tomadorDocumento: tomador.documento,
        criadoPorId: p.criadoPorId,
        envioCliente: canais,
      }),
    }),
  );

  const cert = await certificadoGuardado(escritorioId);
  return { nota, avisos, titularId: cert?.titularId ?? null };
}

// ---------------------------------------------------------------------------
// Assinar
// ---------------------------------------------------------------------------

export type ResultadoNota =
  | { status: "EMITIDA"; nota: NotaFiscal; avisos: string[] }
  | { status: "REJEITADA"; nota: NotaFiscal; erros: ErroApi[]; avisos: string[] }
  | { status: "PROCESSANDO"; nota: NotaFiscal; avisos: string[] };

const ASSINAVEIS = new Set(["AGUARDANDO_ASSINATURA", "REJEITADA", "RECUSADA"]);

/**
 * Assinatura do titular: reserva o numero da DPS, assina e transmite. Aceita
 * nota aguardando assinatura ou rejeitada (depois de corrigir o cadastro,
 * assina de novo com numero novo).
 */
export async function assinarNota(
  escritorioId: string,
  notaId: string,
  usuarioId: string,
  cert: CertificadoCarregado,
): Promise<ResultadoNota> {
  const registro = await comEscritorio(escritorioId, (db) =>
    db.notaFiscal.findFirst({ where: { id: notaId }, include: { cliente: true } }),
  );
  if (!registro) throw new NotaInvalida("Nota nao encontrada.", 404);
  const { cliente, ...notaBase } = registro;
  if (!ASSINAVEIS.has(notaBase.status)) throw new NotaInvalida("Esta nota nao esta aguardando assinatura.", 409);

  const fiscal = await comEscritorio(escritorioId, (db) => db.fiscal.findFirst());
  if (!fiscal) throw new SemCadastroFiscal();
  const guardado = await certificadoGuardado(escritorioId);
  const dataCompetencia = notaBase.dataCompetencia ?? notaBase.criadoEm;
  const pendencias = pendenciasDoEmissor(fiscal, guardado, dataCompetencia);
  if (pendencias.length > 0) throw new NotaInvalida(pendencias.join(" "), 428);
  if (!cliente) throw new NotaInvalida("O cliente desta nota foi excluido — descarte a nota e prepare outra.");
  if (cert.cnpj && cert.cnpj !== fiscal.cnpj.replace(/\D/g, "")) {
    throw new NotaInvalida("O certificado aberto e de outro CNPJ — a API recusa (rejeicao E0718).");
  }

  // Assinada com a configuracao de agora: se o escritorio mudou de ambiente
  // desde o preparo, vale a atual.
  const ambiente = fiscal.ambiente as Ambiente;
  const competencia = competenciaISO(dataCompetencia);
  const { tomador, avisos } = await tomadorDoCliente(cliente);

  // Com IBS/CBS o local da operacao e o domicilio do cliente (codigo de
  // operacao 100301), entao a nota nao sai sem o endereco dele.
  const ibsCbs = ibsCbsVigente(fiscal, dataCompetencia);
  if (ibsCbs && !tomador.endereco) {
    throw new NotaInvalida(
      "A partir do IBS/CBS a nota precisa do endereco completo do cliente, com CEP valido — complete o cadastro antes de assinar.",
    );
  }

  const regime = regimeVigente(fiscal, dataCompetencia);

  // Reserva o numero antes de enviar: duas emissoes ao mesmo tempo nunca
  // pegam o mesmo numero.
  const prepararDps = async (informarIm: boolean) => {
    const reservado = await comEscritorio(escritorioId, (db) =>
      db.fiscal.update({
        where: { id: fiscal.id },
        data: { proximoNumero: { increment: 1 } },
        select: { proximoNumero: true },
      }),
    );
    const numero = reservado.proximoNumero - 1;
    const { xml, idDps } = montarDps(
      {
        cnpj: fiscal.cnpj,
        inscricaoMunicipal: informarIm ? fiscal.inscricaoMunicipal : null,
        codigoMunicipio: fiscal.codigoMunicipio,
        telefone: fiscal.telefone,
        email: fiscal.email,
        ...regime,
        codigoTributacaoNacional: fiscal.codigoTributacao,
        codigoNbs: fiscal.codigoNbs,
        ibsCbs,
      },
      {
        ambiente,
        serie: fiscal.serie,
        numero,
        // Um minuto antes: a regra E0008 recusa DPS com horario a frente do servidor nacional.
        dataEmissao: new Date(Date.now() - 60_000),
        dataCompetencia: competencia,
        tomador,
        descricao: notaBase.descricao,
        valorCentavos: notaBase.valorCentavos,
        informacoesComplementares: notaBase.informacoesComplementares,
      },
    );
    return { numero, idDps, assinado: assinarXml(xml, "infDPS", cert) };
  };

  let { numero, idDps, assinado } = await prepararDps(true);

  const atualizar = (data: AtualizacaoDaNota) => atualizarNota(escritorioId, notaBase.id, data);

  let nota = await atualizar({
    status: "PROCESSANDO",
    ambiente,
    serie: fiscal.serie,
    numero,
    idDps,
    tomadorNome: tomador.nome,
    tomadorDocumento: tomador.documento,
    xmlEnviado: assinado,
    erros: [],
    erro: null,
    assinadaPorId: usuarioId,
    assinadaEm: new Date(),
  });

  try {
    let r = await enviarDps(ambiente, assinado, cert);

    // E0120: a inscricao municipal existe na prefeitura mas nao esta no
    // cadastro nacional (CNC) — ai a DPS NAO pode informa-la. Reenvia na hora
    // sem ela, com numero novo (o anterior foi recusado e nao gerou nota).
    if (!r.ok && fiscal.inscricaoMunicipal && r.erros.some((e) => e.codigo === "E0120")) {
      ({ numero, idDps, assinado } = await prepararDps(false));
      nota = await atualizar({ numero, idDps, xmlEnviado: assinado });
      r = await enviarDps(ambiente, assinado, cert);
    }

    if (r.ok) {
      nota = await registrarEmitida(escritorioId, nota, r.chaveAcesso, r.nfseXml);
      return { status: "EMITIDA", nota, avisos: [...avisos, ...r.alertas.map((a) => `${a.codigo} ${a.descricao}`)] };
    }
    nota = await atualizar({
      status: "REJEITADA",
      erros: r.erros,
      erro: r.erros.map((e) => `${e.codigo} ${e.descricao}`).join(" | ").slice(0, 1000),
    });
    return { status: "REJEITADA", nota, erros: r.erros, avisos };
  } catch (e) {
    // Caiu a conexao depois de enviar: a nota pode ter sido gerada do lado de
    // la. Pergunta pela DPS.
    console.error("[nfse] falha no envio da DPS", idDps, (e as Error)?.message ?? e);
    const recuperada = await recuperarPorDps(escritorioId, nota, cert).catch(() => null);
    if (recuperada) return { status: "EMITIDA", nota: recuperada, avisos };
    const erros = [{ codigo: "CONEXAO", descricao: (e as Error)?.message ?? "Falha de conexao com a API nacional." }];
    nota = await atualizar({ erros, erro: erros[0].descricao });
    return {
      status: "PROCESSANDO",
      nota,
      avisos: [...avisos, 'A API nacional nao respondeu. Use "Verificar situacao" em alguns minutos — o sistema confere se a nota chegou a ser gerada.'],
    };
  }
}

type AtualizacaoDaNota = Partial<Omit<NotaFiscal, "id" | "escritorioId" | "erros" | "criadoEm" | "envioCliente">> & {
  /** Erros da Sefin; lista vazia = sem erros. */
  erros?: ErroApi[];
};

async function atualizarNota(escritorioId: string, id: string, data: AtualizacaoDaNota): Promise<NotaFiscal> {
  return comEscritorio(escritorioId, (db) => db.notaFiscal.update({ where: { id }, data }));
}

async function registrarEmitida(escritorioId: string, nota: NotaFiscal, chave: string, nfseXml: string): Promise<NotaFiscal> {
  let numeroNfse: string | null = null;
  try {
    numeroNfse = lerNfse(nfseXml).txt("nNFSe");
  } catch {
    numeroNfse = null;
  }
  const atualizada = await atualizarNota(escritorioId, nota.id, {
    status: "EMITIDA",
    chaveAcesso: chave,
    numeroNaPrefeitura: numeroNfse,
    xmlRetorno: nfseXml,
    erros: [],
    erro: null,
    emitidaEm: new Date(),
  });
  if (atualizada.ambiente === "PRODUCAO") {
    await registrarConsumo(escritorioId, "NFSE_EMITIDA", 1).catch((e) =>
      console.error("[nfse] consumo nao registrado:", (e as Error).message),
    );
  }
  return atualizada;
}

async function recuperarPorDps(
  escritorioId: string,
  nota: NotaFiscal,
  cert: CertificadoCarregado,
): Promise<NotaFiscal | null> {
  const ambiente = nota.ambiente as Ambiente;
  if (!nota.idDps) return null;
  const chave = await consultarDps(ambiente, nota.idDps, cert);
  if (!chave) return null;
  const xml = await consultarNfse(ambiente, chave, cert);
  if (!xml) return null;
  return registrarEmitida(escritorioId, nota, chave, xml);
}

/** Nota que ficou "processando" (queda de conexao): confere na API se foi gerada. */
export async function verificarSituacao(
  escritorioId: string,
  notaId: string,
  cert: CertificadoCarregado,
): Promise<NotaFiscal> {
  const nota = await comEscritorio(escritorioId, (db) => db.notaFiscal.findFirst({ where: { id: notaId } }));
  if (!nota) throw new NotaInvalida("Nota nao encontrada.", 404);
  if ((nota.status !== "PROCESSANDO" && nota.status !== "INDETERMINADA") || !nota.idDps) return nota;
  const recuperada = await recuperarPorDps(escritorioId, nota, cert);
  if (recuperada) return recuperada;
  const erros = [{ codigo: "NAO_GERADA", descricao: "A API nacional confirmou que nao gerou nota para esta DPS. Pode assinar de novo." }];
  return atualizarNota(escritorioId, nota.id, { status: "REJEITADA", erros, erro: erros[0].descricao });
}

export async function cancelarNota(
  escritorioId: string,
  notaId: string,
  cert: CertificadoCarregado,
  motivo: MotivoDeCancelamento,
  descricaoMotivo: string,
): Promise<NotaFiscal> {
  const nota = await comEscritorio(escritorioId, (db) => db.notaFiscal.findFirst({ where: { id: notaId } }));
  if (!nota) throw new NotaInvalida("Nota nao encontrada.", 404);
  if (nota.status !== "EMITIDA" || !nota.chaveAcesso) throw new NotaInvalida("So nota emitida pode ser cancelada.", 409);
  const texto = descricaoMotivo.trim();
  if (texto.length < 15) throw new NotaInvalida("Explique o motivo do cancelamento com pelo menos 15 caracteres.");
  const fiscal = await comEscritorio(escritorioId, (db) => db.fiscal.findFirst());
  if (!fiscal) throw new SemCadastroFiscal();

  const ambiente = nota.ambiente as Ambiente;
  const pedido = montarPedidoCancelamento({
    ambiente,
    cnpjAutor: fiscal.cnpj,
    chave: nota.chaveAcesso,
    motivo,
    descricaoMotivo: texto.slice(0, 255),
    dataEvento: new Date(Date.now() - 60_000),
  });
  const r = await enviarEvento(ambiente, nota.chaveAcesso, assinarXml(pedido, "infPedReg", cert), cert);
  if (!r.ok) throw new NotaInvalida(r.erros.map((e) => `${e.codigo} — ${e.descricao}`).join(" | "), 502);

  return atualizarNota(escritorioId, nota.id, {
    status: "CANCELADA",
    canceladaEm: new Date(),
    motivoCancelamento: texto,
    eventoXml: r.eventoXml,
  });
}

/** Descarta nota que nao foi emitida (aguardando ou recusada). */
export async function descartarNota(escritorioId: string, notaId: string): Promise<void> {
  const r = await comEscritorio(escritorioId, (db) =>
    db.notaFiscal.deleteMany({ where: { id: notaId, status: { in: [...ASSINAVEIS] } } }),
  );
  if (r.count === 0) throw new NotaInvalida("So nota que nao foi emitida pode ser descartada.", 409);
}

/** Assinatura em lote: abre o certificado uma vez, assina nota por nota. */
export async function assinarNotas(
  escritorioId: string,
  quem: { usuarioId: string; papel: string },
  ids: string[],
  senha: string,
): Promise<{ id: string; status: string; erro?: string; numeroNfse?: string | null; avisos: string[] }[]> {
  const cert = await abrirCertificadoDoEscritorio(escritorioId, quem, senha);
  const resultados = [];
  for (const id of ids) {
    try {
      const r = await assinarNota(escritorioId, id, quem.usuarioId, cert);
      resultados.push({
        id,
        status: r.status,
        numeroNfse: r.nota.numeroNaPrefeitura,
        erro: r.status === "REJEITADA" ? r.erros.map((e) => `${e.codigo} ${e.descricao}`).join(" | ") : undefined,
        avisos: r.avisos,
      });
    } catch (e) {
      resultados.push({ id, status: "NAO_ASSINADA", erro: (e as Error).message, avisos: [] });
    }
  }
  return resultados;
}
