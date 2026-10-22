// Nota fiscal da mensalidade: a Blackbird emitindo para o escritorio
// (decidido em 16/10/2026).
//
// NAO CONFUNDIR com src/lib/nfse/emissao.ts, que e o escritorio emitindo para
// os clientes DELE. O motor e o mesmo (montar a DPS, assinar, transmitir a
// Sefin Nacional, ler a resposta, gerar o DANFSe); o que muda e quem emite:
//
//   escritorio -> cadastro "Fiscal" dele + certificado dele, assinado por
//                 quem tem a senha, na hora (a plataforma nunca a conhece);
//   plataforma -> "FiscalDaPlataforma" + o e-CNPJ da Blackbird, que vem das
//                 variaveis NFSE_PLATAFORMA_PFX e NFSE_PLATAFORMA_SENHA no
//                 Railway. Por isso pode ser automatica: o segredo e nosso.
//
// QUANDO SAI
//
// - sozinha, quando a fatura e paga (webhook do Asaas ou baixa manual), se o
//   emissor estiver com "automatica" ligado — pela fila, para nao segurar o
//   webhook;
// - pelo operador, no console, para qualquer fatura (paga por fora, por
//   exemplo). O operador tambem cancela e confere nota que ficou pendente.
//
// Emitida, vai ao e-mail do escritorio com o link do PDF e do XML.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { FiscalDaPlataforma, NotaDaPlataforma, Prisma } from "@prisma/client";
import { prismaPlataforma } from "./prisma";
import { cifrar, decifrar } from "./segredo";
import { carregarDeBase64, type CertificadoCarregado } from "./nfse/certificado";
import { assinarXml } from "./nfse/assinar";
import { consultarDps, consultarNfse, enviarDps, enviarEvento, type Ambiente, type ErroApi } from "./nfse/api";
import { montarDps, montarPedidoCancelamento, type MotivoDeCancelamento } from "./nfse/dps";
import { ibsCbsVigente, pendenciasDoIbsCbs, pendenciasDoRegime, regimeVigente } from "./nfse/regime";
import { NotaInvalida, tomadorDoCliente } from "./nfse/emissao";
import { lerNfse } from "./nfse/ler-xml";
import { descricaoDaFatura, ehFaturaAnual } from "./cobranca-plataforma";
import { enviarPelaPlataforma, temRemetenteDaPlataforma } from "./email-plataforma";

export { NotaInvalida };

const ID = "PLATAFORMA";
const reais = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100).replace(/ /g, " ");

export async function fiscalDaPlataforma(): Promise<FiscalDaPlataforma | null> {
  return prismaPlataforma().fiscalDaPlataforma.findUnique({ where: { id: ID } });
}

// ---------------------------------------------------------------------------
// Certificado
// ---------------------------------------------------------------------------

let certificadoEmCache: { chave: string; cert: CertificadoCarregado } | null = null;

type CertificadoGuardadoDaPlataforma = { arquivo: string; senha: string };

function carregarComCache(chave: string, pfx: string, senha: string): CertificadoCarregado {
  if (certificadoEmCache?.chave !== chave) {
    certificadoEmCache = { chave, cert: carregarDeBase64(pfx, senha) };
  }
  return certificadoEmCache.cert;
}

/**
 * O e-CNPJ da Blackbird. Primeiro o enviado pelo console (cifrado no banco);
 * na falta dele, as variaveis NFSE_PLATAFORMA_PFX e NFSE_PLATAFORMA_SENHA.
 * null sem nenhum dos dois.
 */
export async function certificadoDaPlataforma(
  fiscal?: Pick<FiscalDaPlataforma, "certificado"> | null,
): Promise<CertificadoCarregado | null> {
  const f =
    fiscal === undefined
      ? await prismaPlataforma().fiscalDaPlataforma.findUnique({ where: { id: ID }, select: { certificado: true } })
      : fiscal;
  if (f?.certificado) {
    const guardado = decifrar<CertificadoGuardadoDaPlataforma>(f.certificado);
    return carregarComCache(`banco:${createHash("sha256").update(f.certificado).digest("hex")}`, guardado.arquivo, guardado.senha);
  }
  const pfx = process.env.NFSE_PLATAFORMA_PFX?.trim();
  const senha = process.env.NFSE_PLATAFORMA_SENHA;
  if (!pfx || !senha) return null;
  return carregarComCache(`ambiente:${pfx.length}:${pfx.slice(-16)}`, pfx, senha);
}

export class CertificadoRecusado extends Error {
  readonly status = 400;
  constructor(motivo: string) {
    super(motivo);
    this.name = "CertificadoRecusado";
  }
}

/**
 * Guarda o e-CNPJ enviado pelo console. O arquivo e aberto AGORA com a senha:
 * so entra se abrir, se for e-CNPJ, se for do CNPJ do cadastro fiscal e se
 * estiver na validade. A senha fica guardada (cifrada) porque a emissao
 * automatica assina sem ninguem na tela.
 */
export async function guardarCertificadoDaPlataforma(
  pfx: Buffer,
  senha: string,
  agora = new Date(),
): Promise<{ titular: string; validoAte: Date }> {
  const fiscal = await fiscalDaPlataforma();
  if (!fiscal) throw new CertificadoRecusado("Cadastre o emissor (razão social, CNPJ, município) antes do certificado.");
  let cert: CertificadoCarregado;
  try {
    cert = carregarDeBase64(pfx.toString("base64"), senha);
  } catch (e) {
    throw new CertificadoRecusado((e as Error).message);
  }
  if (!cert.cnpj) throw new CertificadoRecusado("Este é um e-CPF. Para emitir nota é preciso o e-CNPJ da empresa.");
  if (cert.cnpj !== fiscal.cnpj.replace(/\D/g, "")) {
    throw new CertificadoRecusado(`Este certificado é do CNPJ ${cert.cnpj}, diferente do cadastro fiscal. A Receita recusa (E0718).`);
  }
  if (cert.validoAte < agora) throw new CertificadoRecusado(`Certificado vencido em ${cert.validoAte.toLocaleDateString("pt-BR")}.`);
  if (cert.validoDesde > agora) throw new CertificadoRecusado("Certificado ainda não está válido.");

  const guardado: CertificadoGuardadoDaPlataforma = { arquivo: pfx.toString("base64"), senha };
  await prismaPlataforma().fiscalDaPlataforma.update({
    where: { id: ID },
    data: {
      certificado: cifrar(guardado),
      certificadoTitular: cert.titular,
      certificadoValidoAte: cert.validoAte,
      certificadoEnviadoEm: agora,
    },
  });
  certificadoEmCache = null;
  return { titular: cert.titular, validoAte: cert.validoAte };
}

export async function removerCertificadoDaPlataforma(): Promise<void> {
  await prismaPlataforma().fiscalDaPlataforma.update({
    where: { id: ID },
    data: { certificado: null, certificadoTitular: null, certificadoValidoAte: null, certificadoEnviadoEm: null },
  });
  certificadoEmCache = null;
}

/**
 * Lembrete do percentual de tributos que sai em cada nota.
 *
 * Nao e pendencia e nao trava nada: a nota sai, automatica ou manual. Existe
 * para o administrador conferir, a cada emissao, se o enquadramento no
 * Simples (anexo, Fator R) continua o mesmo e o percentual ainda vale.
 */
export function lembreteDoPercentual(fiscal: Pick<FiscalDaPlataforma, "opSimpNac" | "pTotTribSN"> | null): string | null {
  if (!fiscal || fiscal.opSimpNac !== 3 || fiscal.pTotTribSN === null || fiscal.pTotTribSN === undefined) return null;
  const pct = Number(fiscal.pTotTribSN).toFixed(2).replace(".", ",");
  return `Percentual aproximado de tributos que sai na nota: ${pct}% (Simples Nacional). Confira com o contador se o enquadramento continua o mesmo; mudou, ajuste no cadastro fiscal antes de emitir.`;
}

/** O que falta para a plataforma emitir. Vazio = pode emitir. */
export function pendenciasDaPlataforma(
  fiscal: FiscalDaPlataforma | null,
  cert: CertificadoCarregado | null,
  competencia = new Date(),
): string[] {
  const p: string[] = [];
  if (!fiscal) return ["Cadastrar o emissor (Blackbird) no console: razão social, CNPJ, município e regime."];
  if (!cert) p.push("Enviar o certificado e-CNPJ da Blackbird (arquivo .pfx e senha) aqui no console.");
  if (cert && cert.cnpj !== fiscal.cnpj.replace(/\D/g, "")) {
    p.push("O certificado configurado é de outro CNPJ — a Sefin recusa (E0718).");
  }
  if (cert && cert.validoAte < competencia) p.push("O certificado da Blackbird está vencido.");
  p.push(...pendenciasDoRegime(regimeVigente(fiscal, competencia), ""));
  p.push(...pendenciasDoIbsCbs(fiscal));
  return p;
}

// ---------------------------------------------------------------------------
// Link do PDF e do XML no e-mail
// ---------------------------------------------------------------------------

function segredo(): string {
  const s = process.env.SEGREDO_CHAVE?.trim();
  if (!s) throw new Error("SEGREDO_CHAVE ausente: sem ela não há link assinado da nota.");
  return s;
}

/** Assinatura do link: so quem recebeu o e-mail abre a nota sem entrar. */
export function tokenDaNota(id: string): string {
  return createHmac("sha256", segredo()).update(`nota-da-plataforma:${id}`).digest("base64url").slice(0, 32);
}

export function tokenConfere(id: string, token: string | null): boolean {
  if (!token) return false;
  const esperado = Buffer.from(tokenDaNota(id));
  const recebido = Buffer.from(token);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

export function linksDaNota(id: string): { pdf: string; xml: string } {
  const base = `https://${process.env.DOMINIO_PLATAFORMA?.trim() || "birdjud.com.br"}/api/notas-da-plataforma/${id}`;
  const t = tokenDaNota(id);
  return { pdf: `${base}/pdf?t=${t}`, xml: `${base}/xml?t=${t}` };
}

// ---------------------------------------------------------------------------
// Emitir
// ---------------------------------------------------------------------------

export type Origem = "AUTOMATICA" | "MANUAL";

/** A data de competencia: o dia do pagamento (ou hoje), nunca futuro (E0015). */
function competenciaDa(pagoEm: Date | null, agora: Date): Date {
  const d = pagoEm && pagoEm <= agora ? pagoEm : agora;
  return new Date(`${d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })}T12:00:00Z`);
}

/** Itens da fatura numa linha, para as informacoes complementares. */
function resumoDosItens(detalhe: unknown): string | null {
  if (!Array.isArray(detalhe)) return null;
  const itens = detalhe
    .filter((i) => typeof i?.descricao === "string" && typeof i?.valorCentavos === "number")
    .map((i) => `${i.descricao}: ${reais(i.valorCentavos)}`);
  return itens.length ? itens.join("; ") : null;
}

async function atualizar(id: string, data: Prisma.NotaDaPlataformaUpdateInput): Promise<NotaDaPlataforma> {
  return prismaPlataforma().notaDaPlataforma.update({ where: { id }, data });
}

/**
 * Emite a nota da fatura. Idempotente: fatura com nota emitida ou em
 * processamento devolve a que existe; nota recusada e reaproveitada com
 * numero novo.
 */
export async function emitirNotaDaFatura(
  faturaId: string,
  origem: Origem,
  agora = new Date(),
): Promise<NotaDaPlataforma> {
  const fatura = await prismaPlataforma().fatura.findUnique({
    where: { id: faturaId },
    include: {
      escritorio: {
        select: { id: true, nome: true, razaoSocial: true, cnpj: true, enderecos: true, telefoneAtendimento: true },
      },
    },
  });
  if (!fatura) throw new NotaInvalida("Fatura não encontrada.", 404);
  if (fatura.valorCentavos <= 0) throw new NotaInvalida("Fatura sem valor não gera nota.");
  if (fatura.status === "CANCELADA") throw new NotaInvalida("Fatura cancelada não gera nota.");

  const existente = await prismaPlataforma().notaDaPlataforma.findUnique({ where: { faturaId } });
  if (existente && (existente.status === "EMITIDA" || existente.status === "PROCESSANDO")) return existente;

  const fiscal = await fiscalDaPlataforma();
  const cert = await certificadoDaPlataforma(fiscal);
  const competencia = competenciaDa(fatura.pagoEm, agora);
  const pendencias = pendenciasDaPlataforma(fiscal, cert, competencia);
  if (pendencias.length) throw new NotaInvalida(pendencias.join(" "), 428);

  const esc = fatura.escritorio;
  const admin = await prismaPlataforma().usuario.findFirst({
    where: { escritorioId: esc.id, papel: "ADMIN", ativo: true },
    select: { email: true },
    orderBy: { criadoEm: "asc" },
  });
  const sede = Array.isArray(esc.enderecos) ? (esc.enderecos[0] ?? null) : null;
  const { tomador } = await tomadorDoCliente({
    documento: esc.cnpj,
    nome: esc.razaoSocial || esc.nome,
    email: admin?.email ?? null,
    telefone: esc.telefoneAtendimento,
    endereco: sede,
  } as never);
  if (!tomador.documento) {
    throw new NotaInvalida("O escritório não tem CNPJ cadastrado: a nota precisa identificar o tomador.");
  }

  const anual = ehFaturaAnual(fatura.detalhe);
  const descricao = `${fiscal!.descricaoPadrao} - ${descricaoDaFatura(fatura.competencia, anual).replace(/^BirdJud — /, "")}`;
  const complementares = [
    `Fatura ${fatura.competencia} do BirdJud.`,
    resumoDosItens(fatura.detalhe),
  ]
    .filter(Boolean)
    .join(" ");

  const ambiente = fiscal!.ambiente as Ambiente;
  const regime = regimeVigente(fiscal!, competencia);
  const ibsCbs = ibsCbsVigente(fiscal!, competencia);
  if (ibsCbs && !tomador.endereco) {
    throw new NotaInvalida("Com IBS/CBS a nota precisa do endereço completo do escritório, com CEP válido.");
  }

  const base = {
    escritorioId: esc.id,
    ambiente,
    serie: fiscal!.serie,
    tomadorNome: tomador.nome,
    tomadorDocumento: tomador.documento,
    tomadorEmail: tomador.email,
    valorCentavos: fatura.valorCentavos,
    descricao,
    competencia,
    erros: [] as Prisma.InputJsonValue,
    erro: null,
  };
  let nota = existente
    ? await atualizar(existente.id, { ...base, status: "PROCESSANDO", origem })
    : await prismaPlataforma().notaDaPlataforma.create({
        data: { ...base, faturaId, faturaOriginalId: faturaId, origem, status: "PROCESSANDO" },
      });

  // Reserva o numero antes de mandar: duas emissoes juntas nunca pegam o mesmo.
  const prepararDps = async (informarIm: boolean) => {
    const { proximoNumero } = await prismaPlataforma().fiscalDaPlataforma.update({
      where: { id: ID },
      data: { proximoNumero: { increment: 1 } },
      select: { proximoNumero: true },
    });
    const numero = proximoNumero - 1;
    const { xml, idDps } = montarDps(
      {
        cnpj: fiscal!.cnpj,
        inscricaoMunicipal: informarIm ? fiscal!.inscricaoMunicipal : null,
        codigoMunicipio: fiscal!.codigoMunicipio,
        telefone: fiscal!.telefone,
        email: fiscal!.email,
        ...regime,
        codigoTributacaoNacional: fiscal!.codigoTributacao,
        codigoNbs: fiscal!.codigoNbs,
        ibsCbs,
      },
      {
        ambiente,
        serie: fiscal!.serie,
        numero,
        // Um minuto antes: E0008 recusa DPS a frente do relogio da Sefin.
        dataEmissao: new Date(agora.getTime() - 60_000),
        dataCompetencia: competencia.toISOString().slice(0, 10),
        tomador,
        descricao,
        valorCentavos: fatura.valorCentavos,
        informacoesComplementares: complementares || null,
      },
    );
    return { numero, idDps, assinado: assinarXml(xml, "infDPS", cert!) };
  };

  let { numero, idDps, assinado } = await prepararDps(true);
  nota = await atualizar(nota.id, { numero, idDps, xmlEnviado: assinado });

  try {
    let r = await enviarDps(ambiente, assinado, cert!);
    // E0120: inscricao municipal fora do cadastro nacional — reenvia sem ela.
    if (!r.ok && fiscal!.inscricaoMunicipal && r.erros.some((e) => e.codigo === "E0120")) {
      ({ numero, idDps, assinado } = await prepararDps(false));
      nota = await atualizar(nota.id, { numero, idDps, xmlEnviado: assinado });
      r = await enviarDps(ambiente, assinado, cert!);
    }
    if (r.ok) {
      nota = await registrarEmitida(nota, r.chaveAcesso, r.nfseXml);
      await mandarNotaPorEmail(nota.id).catch((e) =>
        console.error(`[nota-plataforma] ${nota.id} emitida, mas o e-mail falhou: ${(e as Error).message}`),
      );
      return nota;
    }
    return await atualizar(nota.id, {
      status: "REJEITADA",
      erros: r.erros as Prisma.InputJsonValue,
      erro: r.erros
        .map((e) => `${e.codigo} ${e.descricao}${e.complemento ? ` (${e.complemento})` : ""}`)
        .join(" | ")
        .slice(0, 1000),
    });
  } catch (e) {
    // A conexao caiu depois do envio: a nota pode ter sido gerada la.
    console.error("[nota-plataforma] falha no envio da DPS", idDps, (e as Error)?.message ?? e);
    const recuperada = await recuperarPorDps(nota, cert!).catch(() => null);
    if (recuperada) return recuperada;
    const erros: ErroApi[] = [{ codigo: "CONEXAO", descricao: (e as Error)?.message ?? "Falha de conexão com a API nacional." }];
    return atualizar(nota.id, { erros: erros as Prisma.InputJsonValue, erro: erros[0].descricao });
  }
}

async function registrarEmitida(nota: NotaDaPlataforma, chave: string, nfseXml: string): Promise<NotaDaPlataforma> {
  let numeroNfse: string | null = null;
  try {
    numeroNfse = lerNfse(nfseXml).txt("nNFSe");
  } catch {
    numeroNfse = null;
  }
  return atualizar(nota.id, {
    status: "EMITIDA",
    chaveAcesso: chave,
    numeroNaPrefeitura: numeroNfse,
    xmlRetorno: nfseXml,
    erros: [],
    erro: null,
    emitidaEm: new Date(),
  });
}

async function recuperarPorDps(nota: NotaDaPlataforma, cert: CertificadoCarregado): Promise<NotaDaPlataforma | null> {
  if (!nota.idDps) return null;
  const ambiente = nota.ambiente as Ambiente;
  const chave = await consultarDps(ambiente, nota.idDps, cert);
  if (!chave) return null;
  const xml = await consultarNfse(ambiente, chave, cert);
  if (!xml) return null;
  const emitida = await registrarEmitida(nota, chave, xml);
  await mandarNotaPorEmail(emitida.id).catch(() => {});
  return emitida;
}

/** Nota que ficou "processando" (queda de conexao): confere na Sefin. */
export async function verificarNotaDaPlataforma(id: string): Promise<NotaDaPlataforma> {
  const nota = await prismaPlataforma().notaDaPlataforma.findUnique({ where: { id } });
  if (!nota) throw new NotaInvalida("Nota não encontrada.", 404);
  if (nota.status !== "PROCESSANDO" || !nota.idDps) return nota;
  const cert = await certificadoDaPlataforma();
  if (!cert) throw new NotaInvalida("Certificado da Blackbird não configurado.", 428);
  const recuperada = await recuperarPorDps(nota, cert);
  if (recuperada) return recuperada;
  const erros = [{ codigo: "NAO_GERADA", descricao: "A API nacional confirmou que não gerou nota para esta DPS. Pode emitir de novo." }];
  return atualizar(nota.id, { status: "REJEITADA", erros, erro: erros[0].descricao });
}

// ---------------------------------------------------------------------------
// Cancelar
// ---------------------------------------------------------------------------

export async function cancelarNotaDaPlataforma(
  id: string,
  motivo: MotivoDeCancelamento,
  justificativa: string,
): Promise<NotaDaPlataforma> {
  const nota = await prismaPlataforma().notaDaPlataforma.findUnique({ where: { id } });
  if (!nota) throw new NotaInvalida("Nota não encontrada.", 404);
  if (nota.status !== "EMITIDA" || !nota.chaveAcesso) throw new NotaInvalida("Só nota emitida pode ser cancelada.", 409);
  const texto = justificativa.trim();
  if (texto.length < 15) throw new NotaInvalida("Explique o motivo do cancelamento com pelo menos 15 caracteres.");
  const fiscal = await fiscalDaPlataforma();
  const cert = await certificadoDaPlataforma(fiscal);
  if (!fiscal || !cert) throw new NotaInvalida("Emissor ou certificado da Blackbird não configurado.", 428);

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

  // Solta a fatura: outra nota pode ser emitida para ela.
  const cancelada = await atualizar(nota.id, {
    status: "CANCELADA",
    canceladaEm: new Date(),
    motivoCancelamento: texto,
    eventoXml: r.eventoXml,
    faturaId: null,
  });
  await mandarCancelamentoPorEmail(cancelada).catch((e) =>
    console.error(`[nota-plataforma] ${nota.id} cancelada, mas o aviso falhou: ${(e as Error).message}`),
  );
  return cancelada;
}

// ---------------------------------------------------------------------------
// E-mail
// ---------------------------------------------------------------------------

/** Manda (ou reenvia) a nota emitida ao e-mail do escritorio. */
export async function mandarNotaPorEmail(id: string): Promise<boolean> {
  const nota = await prismaPlataforma().notaDaPlataforma.findUnique({ where: { id } });
  if (!nota || nota.status !== "EMITIDA" || !nota.tomadorEmail || !temRemetenteDaPlataforma()) return false;
  const { pdf, xml } = linksDaNota(nota.id);
  const numero = nota.numeroNaPrefeitura ?? String(nota.numero ?? "");
  await enviarPelaPlataforma({
    para: nota.tomadorEmail,
    assunto: `BirdJud — nota fiscal ${numero} da assinatura`,
    texto: [
      `${nota.tomadorNome},`,
      "",
      "A nota fiscal de serviço da sua assinatura do BirdJud foi emitida.",
      "",
      `Numero: ${numero}`,
      `Valor: ${reais(nota.valorCentavos)}`,
      `Servico: ${nota.descricao}`,
      ...(nota.chaveAcesso ? [`Chave de acesso: ${nota.chaveAcesso}`] : []),
      ...(nota.ambiente !== "PRODUCAO" ? ["", "ATENCAO: nota de TESTE (produção restrita), sem valor fiscal."] : []),
      "",
      `PDF (DANFSe): ${pdf}`,
      `XML: ${xml}`,
      "",
      "A nota também pode ser consultada no Portal Nacional da NFS-e pela chave de acesso.",
      "",
      "BirdJud, by Blackbird",
    ].join("\n"),
  });
  await atualizar(nota.id, { enviadaPara: nota.tomadorEmail, enviadaEm: new Date() });
  return true;
}

async function mandarCancelamentoPorEmail(nota: NotaDaPlataforma): Promise<void> {
  if (!nota.tomadorEmail || !temRemetenteDaPlataforma()) return;
  const numero = nota.numeroNaPrefeitura ?? String(nota.numero ?? "");
  await enviarPelaPlataforma({
    para: nota.tomadorEmail,
    assunto: `BirdJud — nota fiscal ${numero} cancelada`,
    texto: [
      `${nota.tomadorNome},`,
      "",
      `A nota fiscal ${numero} da sua assinatura do BirdJud (${reais(nota.valorCentavos)}) foi cancelada.`,
      `Motivo: ${nota.motivoCancelamento ?? "-"}`,
      "",
      `PDF com a marca de cancelada: ${linksDaNota(nota.id).pdf}`,
      "",
      "BirdJud, by Blackbird",
    ].join("\n"),
  });
}
