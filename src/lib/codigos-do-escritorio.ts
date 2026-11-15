// Codigo de atendimento no banco: gerar, trocar, entregar e avisar.
//
// A regra (quem diz o codigo, por onde ele volta, o que o cliente le) esta em
// codigo-de-atendimento.ts, pura e testada. Aqui so se busca, grava e envia.
import { comEscritorio, prismaPlataforma, semEscritorio } from "./prisma";
import {
  DIAS_ENTRE_AVISOS,
  TOTAL_DE_AVISOS,
  anuncio,
  ehEmpresa,
  emailDeReforco,
  emailServe,
  primeiroAviso,
  primeiroNome,
  reforco,
  regras,
  sortearCodigo,
  type Banca,
  type Canal,
} from "./codigo-de-atendimento";
import { podeReceber } from "./consentimento-de-envio";
import { SemRemetente, credencialDoEscritorio, enviarLote } from "./email";
import { moduloAtivo } from "./modulos";
import { LIMITE_DO_CORPO, MODELOS, limparParametro, modelosDeSegurancaAprovados, preencherModelo } from "./modelos-whatsapp";
import { FalhaNoWhatsapp, SemNumeroDeWhatsapp, enviarModelo, paraE164BR } from "./whatsapp";
import { registrarConsumo } from "./consumo";

export class CodigoIndisponivel extends Error {
  readonly status: number;
  constructor(mensagem: string, status = 409) {
    super(mensagem);
    this.name = "CodigoIndisponivel";
    this.status = status;
  }
}

/** Nome e telefone do escritorio, como o cliente os conhece. */
export async function bancaDoEscritorio(escritorioId: string): Promise<{ banca: Banca; temTelefone: boolean }> {
  const e = await prismaPlataforma().escritorio.findUniqueOrThrow({
    where: { id: escritorioId },
    select: { nome: true, telefoneAtendimento: true },
  });
  const telefone = e.telefoneAtendimento?.trim() || "";
  return { banca: { nome: e.nome, telefone: telefone || "o telefone do escritório" }, temTelefone: Boolean(telefone) };
}

/**
 * O codigo do cliente, criando um se ainda nao tiver.
 *
 * Unico por escritorio NO BANCO: em vez de sortear e conferir, tenta gravar e
 * deixa o banco recusar a repeticao. Duas chamadas ao mesmo tempo para o
 * mesmo cliente tambem batem no indice (clienteId unico) e a segunda le o que
 * a primeira gravou.
 */
export async function garantirCodigo(escritorioId: string, clienteId: string): Promise<string | null> {
  for (let tentativa = 0; tentativa < 25; tentativa++) {
    const atual = await comEscritorio(escritorioId, async (db) => {
      const cliente = await db.cliente.findFirst({ where: { id: clienteId }, select: { id: true } });
      if (!cliente) return { semCliente: true as const };
      const ja = await db.codigoDeAtendimento.findFirst({ where: { clienteId }, select: { codigo: true } });
      return { codigo: ja?.codigo ?? null };
    });
    if ("semCliente" in atual) return null;
    if (atual.codigo) return atual.codigo;
    const codigo = sortearCodigo();
    try {
      await comEscritorio(escritorioId, (db) => db.codigoDeAtendimento.create({ data: semEscritorio({ clienteId, codigo }) }));
      return codigo;
    } catch (erro) {
      // P2002: codigo ja usado no escritorio, ou outra chamada criou primeiro.
      if ((erro as { code?: string }).code !== "P2002") throw erro;
    }
  }
  console.error(`codigo de atendimento: sem codigo livre para o cliente ${clienteId} em 25 tentativas.`);
  return null;
}

/** Cria codigo para todo cliente que ainda nao tem. */
export async function gerarCodigosFaltantes(escritorioId: string): Promise<{ criados: number; falharam: number }> {
  const sem = await comEscritorio(escritorioId, (db) =>
    db.cliente.findMany({ where: { codigoDeAtendimento: null }, select: { id: true }, take: 5000 }),
  );
  let criados = 0;
  let falharam = 0;
  for (const c of sem) {
    if (await garantirCodigo(escritorioId, c.id)) criados += 1;
    else falharam += 1;
  }
  return { criados, falharam };
}

export async function registrarEntrega(
  escritorioId: string,
  e: { clienteId: string; canal: Canal; destino?: string | null; entreguePor?: string | null },
): Promise<void> {
  await comEscritorio(escritorioId, (db) =>
    db.entregaDeCodigo.create({
      data: semEscritorio({ clienteId: e.clienteId, canal: e.canal, destino: e.destino ?? null, entreguePor: e.entreguePor ?? null }),
    }),
  );
}

/**
 * O contrato saiu com o codigo impresso: fica no historico de entregas. Nunca
 * falha quem chama — o contrato ja foi gerado; o que se perde e so a linha do
 * historico.
 */
export async function registrarEntregaPeloContrato(escritorioId: string, clienteId: string, destino: string, quem: string | null): Promise<void> {
  try {
    const tem = await comEscritorio(escritorioId, (db) => db.codigoDeAtendimento.count({ where: { clienteId } }));
    if (tem) await registrarEntrega(escritorioId, { clienteId, canal: "CONTRATO", destino, entreguePor: quem });
  } catch (erro) {
    console.error(`codigo de atendimento: entrega pelo contrato nao registrada: ${(erro as Error).message}`.slice(0, 300));
  }
}

/**
 * Troca o codigo por um novo: para quando ele vazou (o cliente repetiu a quem
 * pediu, papel perdido). O antigo deixa de valer na hora. O novo tem de chegar
 * ao cliente pelos caminhos aceitos: pessoalmente, ou no e-mail do cadastro.
 * A campanha de avisos NAO recomeca: reenviar em massa nao e o caminho.
 */
export async function trocarCodigo(escritorioId: string, clienteId: string, quem: string | null): Promise<string> {
  for (let tentativa = 0; tentativa < 25; tentativa++) {
    const codigo = sortearCodigo();
    try {
      const mudou = await comEscritorio(escritorioId, (db) =>
        db.codigoDeAtendimento.updateMany({ where: { clienteId }, data: { codigo, criadoEm: new Date() } }),
      );
      if (mudou.count === 0) {
        const novo = await garantirCodigo(escritorioId, clienteId);
        if (!novo) throw new CodigoIndisponivel("Cliente não encontrado.", 404);
        return novo;
      }
      await registrarEntrega(escritorioId, { clienteId, canal: "TROCA", entreguePor: quem });
      return codigo;
    } catch (erro) {
      if ((erro as { code?: string }).code !== "P2002") throw erro;
    }
  }
  throw new CodigoIndisponivel("Não consegui sortear um código livre. Tente de novo.");
}

/**
 * Reenvia o codigo ao e-mail QUE JA ESTA NO CADASTRO. Nao recebe endereco: o
 * destino sai do cadastro ou nao ha envio. E a guarda contra o pedido do
 * golpista ("manda meu codigo neste outro e-mail").
 */
export async function reenviarPorEmail(escritorioId: string, clienteId: string, quem: string | null): Promise<string> {
  const cliente = await comEscritorio(escritorioId, (db) =>
    db.cliente.findFirst({ where: { id: clienteId }, select: { nome: true, email: true, documento: true, notificarEmail: true } }),
  );
  if (!cliente) throw new CodigoIndisponivel("Cliente não encontrado.", 404);
  if (!emailServe(cliente.email)) {
    throw new CodigoIndisponivel("Este cliente não tem e-mail no cadastro. O código só volta pessoalmente, no escritório.");
  }
  const codigo = await garantirCodigo(escritorioId, clienteId);
  if (!codigo) throw new CodigoIndisponivel("Não consegui gerar o código deste cliente.");
  const { banca } = await bancaDoEscritorio(escritorioId);
  const { assunto, texto } = primeiroAviso(codigo, cliente.nome, banca, ehEmpresa(cliente.documento));
  const destino = cliente.email!.trim();
  const r = await enviarLote(escritorioId, [{ para: destino, assunto, texto }]);
  if (r.falhas.length) throw new CodigoIndisponivel(`O e-mail não saiu: ${r.falhas[0].motivo}`, 502);
  await registrarConsumo(escritorioId, "EMAIL_ENVIADO", 1);
  await registrarEntrega(escritorioId, { clienteId, canal: "EMAIL", destino, entreguePor: quem });
  return destino;
}

// ---------------------------------------------------------------------------
// A tela
// ---------------------------------------------------------------------------

export type LinhaDoPainel = {
  clienteId: string;
  nome: string;
  documento: string | null;
  telefone: string | null;
  temEmail: boolean;
  codigo: string | null;
  avisoEtapa: number;
  avisoEmailEm: Date | null;
  avisoWhatsappEm: Date | null;
  ultimaEntrega: { canal: string; quando: Date; por: string | null } | null;
};

export async function painelDeCodigos(escritorioId: string): Promise<LinhaDoPainel[]> {
  return comEscritorio(escritorioId, async (db) => {
    const clientes = await db.cliente.findMany({
      orderBy: { nome: "asc" },
      take: 5000,
      select: {
        id: true,
        nome: true,
        documento: true,
        telefone: true,
        email: true,
        codigoDeAtendimento: { select: { codigo: true, avisoEtapa: true, avisoEmailEm: true, avisoWhatsappEm: true } },
        entregasDeCodigo: { orderBy: { criadoEm: "desc" }, take: 1, select: { canal: true, criadoEm: true, entreguePor: true } },
      },
    });
    return clientes.map((c) => ({
      clienteId: c.id,
      nome: c.nome,
      documento: c.documento,
      telefone: c.telefone,
      temEmail: emailServe(c.email),
      codigo: c.codigoDeAtendimento?.codigo ?? null,
      avisoEtapa: c.codigoDeAtendimento?.avisoEtapa ?? 0,
      avisoEmailEm: c.codigoDeAtendimento?.avisoEmailEm ?? null,
      avisoWhatsappEm: c.codigoDeAtendimento?.avisoWhatsappEm ?? null,
      ultimaEntrega: c.entregasDeCodigo[0]
        ? { canal: c.entregasDeCodigo[0].canal, quando: c.entregasDeCodigo[0].criadoEm, por: c.entregasDeCodigo[0].entreguePor }
        : null,
    }));
  });
}

// ---------------------------------------------------------------------------
// A campanha de avisos
// ---------------------------------------------------------------------------

/** Quantos clientes por pedaco: o proxy corta em 100 s e SMTP engasga em lote grande. */
export const CLIENTES_POR_VEZ = 10;

export type CanaisDaCampanha = {
  email: boolean;
  whatsapp: boolean;
  /** Por que o canal esta fora, para a tela dizer. */
  semEmail: string | null;
  semWhatsapp: string | null;
};

/** Por quais canais este escritorio consegue avisar hoje. */
export async function canaisDaCampanha(escritorioId: string): Promise<CanaisDaCampanha> {
  let semEmail: string | null = null;
  try {
    await credencialDoEscritorio(escritorioId);
  } catch (erro) {
    if (!(erro instanceof SemRemetente)) throw erro;
    semEmail = "O e-mail do escritório não está conectado em Integrações.";
  }
  let semWhatsapp: string | null = null;
  if (!(await moduloAtivo(escritorioId, "WHATSAPP"))) semWhatsapp = "O plano do escritório não inclui avisos por WhatsApp.";
  else if (!modelosDeSegurancaAprovados()) semWhatsapp = "Os modelos de segurança ainda aguardam a aprovação da Meta. Enquanto isso, os avisos saem por e-mail.";
  return { email: !semEmail, whatsapp: !semWhatsapp, semEmail, semWhatsapp };
}

type ParaAvisar = {
  id: string;
  clienteId: string;
  codigo: string;
  avisoEtapa: number;
  avisoEmailEm: Date | null;
  avisoWhatsappEm: Date | null;
  cliente: { nome: string; documento: string | null; email: string | null; telefone: string | null; notificarEmail: boolean | null; notificarWhatsapp: boolean | null };
};

const COM_CLIENTE = {
  id: true,
  clienteId: true,
  codigo: true,
  avisoEtapa: true,
  avisoEmailEm: true,
  avisoWhatsappEm: true,
  cliente: { select: { nome: true, documento: true, email: true, telefone: true, notificarEmail: true, notificarWhatsapp: true } },
} as const;

/** Os canais por onde ESTE cliente pode receber, dos que o escritorio tem. */
function canaisDoCliente(c: ParaAvisar["cliente"], canais: { email: boolean; whatsapp: boolean }) {
  return {
    email: canais.email && emailServe(c.email) && podeReceber(c, "EMAIL") ? c.email!.trim() : null,
    whatsapp: canais.whatsapp && podeReceber(c, "WHATSAPP") ? paraE164BR(c.telefone) : null,
  };
}

/** As variaveis do modelo do primeiro aviso; o nome e cortado para a mensagem caber em 1024. */
export function parametrosDoPrimeiroAviso(codigo: string, nomeDoCliente: string, b: Banca): string[] {
  return [
    limparParametro(primeiroNome(nomeDoCliente), 15),
    limparParametro(b.nome, 60),
    limparParametro(anuncio(codigo), 200),
    limparParametro(regras(b).join(" "), 640),
    limparParametro(b.telefone, 30),
  ];
}

export function parametrosDoReforco(etapa: number, nomeDoCliente: string, b: Banca): string[] {
  return [limparParametro(primeiroNome(nomeDoCliente), 15), limparParametro(b.nome, 60), limparParametro(reforco(etapa, b).join(" "), 500), limparParametro(b.telefone, 30)];
}

async function mandarWhatsapp(para: string, chave: "AVISO_DE_SEGURANCA" | "LEMBRETE_DE_SEGURANCA", parametros: string[]): Promise<string | null> {
  const modelo = MODELOS[chave];
  if (preencherModelo(modelo, parametros).length > LIMITE_DO_CORPO) return "mensagem maior que o limite do WhatsApp";
  try {
    await enviarModelo({ para, modelo: modelo.nome, idioma: modelo.idioma, parametros });
    return null;
  } catch (erro) {
    if (erro instanceof SemNumeroDeWhatsapp || erro instanceof FalhaNoWhatsapp) return erro.message;
    throw erro;
  }
}

export type ResultadoDoLote = {
  /** Clientes que receberam por ao menos um canal neste pedaco. */
  avisados: number;
  emails: number;
  whatsapps: number;
  falhas: string[];
  /** Quantos ainda faltam, depois deste pedaco. */
  faltam: number;
  /** Algo andou? Sem isso, um erro que atinge todos faria a tela girar sem fim. */
  progrediu: boolean;
};

/**
 * O PRIMEIRO AVISO: avisa que o escritorio passou a usar codigo e entrega o
 * codigo daquele cliente. Um pedaco de CLIENTES_POR_VEZ por chamada.
 *
 * Por que este manda o codigo por mensagem, se a regra proibe reenviar: a
 * regra proibe reenviar A PEDIDO — e esse o ataque. Esta e a entrega inicial,
 * por iniciativa do escritorio, para o contato que ja estava no cadastro.
 *
 * Nunca manda duas vezes pelo mesmo canal: cada canal grava a sua hora, e
 * repetir o lote so tenta o canal que faltou. `apenasClienteId` passa pelo
 * MESMO filtro (e o teste em um cliente): quem ja recebeu nao entra, entao o
 * botao nao vira "reenviar o codigo a pedido".
 */
export async function enviarPrimeiroAviso(
  escritorioId: string,
  opcoes: { soEmail?: boolean; apenasClienteId?: string; quem: string | null },
): Promise<ResultadoDoLote> {
  const { banca, temTelefone } = await bancaDoEscritorio(escritorioId);
  if (!temTelefone) {
    throw new CodigoIndisponivel("Preencha o telefone de atendimento do escritório em Configurações: o aviso manda o cliente ligar para ele na dúvida.");
  }
  const tem = await canaisDaCampanha(escritorioId);
  const canais = { email: tem.email, whatsapp: tem.whatsapp && !opcoes.soEmail };
  if (!canais.email && !canais.whatsapp) {
    throw new CodigoIndisponivel([tem.semEmail, opcoes.soEmail ? null : tem.semWhatsapp].filter(Boolean).join(" ") || "Nenhum canal de envio disponível.");
  }

  // Quem falta: ainda nao recebeu por um canal que o escritorio tem agora.
  const falta = {
    OR: [
      ...(canais.email ? [{ avisoEmailEm: null, cliente: { email: { not: null }, NOT: { notificarEmail: false } } }] : []),
      ...(canais.whatsapp ? [{ avisoWhatsappEm: null, cliente: { telefone: { not: null }, NOT: { notificarWhatsapp: false } } }] : []),
    ],
    ...(opcoes.apenasClienteId ? { clienteId: opcoes.apenasClienteId } : {}),
  };
  const candidatos: ParaAvisar[] = await comEscritorio(escritorioId, (db) =>
    db.codigoDeAtendimento.findMany({ where: falta, select: COM_CLIENTE, orderBy: { criadoEm: "asc" }, take: CLIENTES_POR_VEZ * 3 }),
  );

  const r: ResultadoDoLote = { avisados: 0, emails: 0, whatsapps: 0, falhas: [], faltam: 0, progrediu: false };
  const semCanal: string[] = [];
  let tratados = 0;
  for (const c of candidatos) {
    if (tratados >= CLIENTES_POR_VEZ) break;
    const destinos = canaisDoCliente(c.cliente, canais);
    const porEmail = destinos.email && !c.avisoEmailEm ? destinos.email : null;
    const porWhatsapp = destinos.whatsapp && !c.avisoWhatsappEm ? destinos.whatsapp : null;
    if (!porEmail && !porWhatsapp) {
      // Telefone ou e-mail que nao serve: nao trava a fila dos outros.
      semCanal.push(c.id);
      continue;
    }
    tratados += 1;
    const agora = new Date();
    const dados: { avisoEmailEm?: Date; avisoWhatsappEm?: Date } = {};
    if (porEmail) {
      const { assunto, texto } = primeiroAviso(c.codigo, c.cliente.nome, banca, ehEmpresa(c.cliente.documento));
      const envio = await enviarLote(escritorioId, [{ para: porEmail, assunto, texto }]);
      if (envio.falhas.length) r.falhas.push(`${c.cliente.nome} (e-mail): ${envio.falhas[0].motivo}`);
      else {
        dados.avisoEmailEm = agora;
        r.emails += 1;
        await registrarEntrega(escritorioId, { clienteId: c.clienteId, canal: "EMAIL", destino: porEmail, entreguePor: opcoes.quem });
      }
    }
    if (porWhatsapp) {
      const falha = await mandarWhatsapp(porWhatsapp, "AVISO_DE_SEGURANCA", parametrosDoPrimeiroAviso(c.codigo, c.cliente.nome, banca));
      if (falha) r.falhas.push(`${c.cliente.nome} (WhatsApp): ${falha}`);
      else {
        dados.avisoWhatsappEm = agora;
        r.whatsapps += 1;
        await registrarEntrega(escritorioId, { clienteId: c.clienteId, canal: "WHATSAPP", destino: porWhatsapp, entreguePor: opcoes.quem });
      }
    }
    if (dados.avisoEmailEm || dados.avisoWhatsappEm) {
      r.avisados += 1;
      await comEscritorio(escritorioId, (db) =>
        db.codigoDeAtendimento.update({
          where: { id: c.id },
          // A etapa 1 e o relogio dos reforcos comecam no primeiro canal que chegou.
          data: { ...dados, ...(c.avisoEtapa === 0 ? { avisoEtapa: 1, avisoEm: agora } : {}) },
        }),
      );
    }
  }
  if (r.emails) await registrarConsumo(escritorioId, "EMAIL_ENVIADO", r.emails);
  if (r.whatsapps) await registrarConsumo(escritorioId, "WHATSAPP_MSG", r.whatsapps);
  r.progrediu = r.avisados > 0;
  const restantes = await comEscritorio(escritorioId, (db) => db.codigoDeAtendimento.count({ where: { ...falta, id: { notIn: semCanal } } }));
  // Se nada andou, o que resta nao vai andar repetindo: a tela para e mostra as falhas.
  r.faltam = restantes;
  return r;
}

/** Hora de Brasilia, 0 a 23. */
function horaEmBrasilia(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "America/Sao_Paulo" }).format(d));
}

/**
 * OS REFORCOS (avisos 2 a 5), pela rotina. So CONTINUA quem ja esta na etapa
 * 1: quem comeca a campanha e o administrador, com o botao — comecar sozinho
 * seria mandar mensagem a carteira inteira sem ninguem ter decidido.
 *
 * Cada cliente tem o seu relogio, contado do SEU ultimo aviso: se um envio
 * falhar numa semana, ele continua de onde parou, sem perder a vez nem receber
 * dois juntos. So em horario comercial: lembrete de seguranca as 3 da manha
 * assusta mais do que protege.
 */
export async function continuarCampanha(escritorioId: string, agora = new Date()): Promise<{ enviados: number; encerrados: number }> {
  const hora = horaEmBrasilia(agora);
  if (hora < 9 || hora >= 18) return { enviados: 0, encerrados: 0 };
  const limite = new Date(agora.getTime() - DIAS_ENTRE_AVISOS * 86_400_000);
  const naVez: ParaAvisar[] = await comEscritorio(escritorioId, (db) =>
    db.codigoDeAtendimento.findMany({
      where: { avisoEtapa: { gte: 1, lt: TOTAL_DE_AVISOS }, avisoEm: { lte: limite } },
      select: COM_CLIENTE,
      orderBy: { avisoEm: "asc" },
      take: CLIENTES_POR_VEZ * 2,
    }),
  );
  if (!naVez.length) return { enviados: 0, encerrados: 0 };
  const { banca, temTelefone } = await bancaDoEscritorio(escritorioId);
  if (!temTelefone) return { enviados: 0, encerrados: 0 };
  const tem = await canaisDaCampanha(escritorioId);

  let enviados = 0;
  let encerrados = 0;
  let emails = 0;
  let whatsapps = 0;
  for (const c of naVez) {
    const etapa = c.avisoEtapa + 1;
    const destinos = canaisDoCliente(c.cliente, tem);
    if (!destinos.email && !destinos.whatsapp) {
      // Sem nenhum canal: vai ao fim da campanha, para nao travar a fila para sempre.
      await comEscritorio(escritorioId, (db) => db.codigoDeAtendimento.update({ where: { id: c.id }, data: { avisoEtapa: TOTAL_DE_AVISOS } }));
      encerrados += 1;
      continue;
    }
    let chegou = false;
    if (destinos.email) {
      const { assunto, texto } = emailDeReforco(etapa, c.cliente.nome, banca, ehEmpresa(c.cliente.documento));
      const envio = await enviarLote(escritorioId, [{ para: destinos.email, assunto, texto }]).catch(() => ({ falhas: [{ para: "", motivo: "" }] }));
      if (!envio.falhas.length) {
        chegou = true;
        emails += 1;
      }
    }
    if (destinos.whatsapp) {
      const falha = await mandarWhatsapp(destinos.whatsapp, "LEMBRETE_DE_SEGURANCA", parametrosDoReforco(etapa, c.cliente.nome, banca));
      if (!falha) {
        chegou = true;
        whatsapps += 1;
      }
    }
    if (!chegou) continue;
    await comEscritorio(escritorioId, (db) => db.codigoDeAtendimento.update({ where: { id: c.id }, data: { avisoEtapa: etapa, avisoEm: agora } }));
    await registrarEntrega(escritorioId, { clienteId: c.clienteId, canal: "REFORCO", destino: `aviso ${etapa} de ${TOTAL_DE_AVISOS}`, entreguePor: "rotina" });
    enviados += 1;
  }
  if (emails) await registrarConsumo(escritorioId, "EMAIL_ENVIADO", emails);
  if (whatsapps) await registrarConsumo(escritorioId, "WHATSAPP_MSG", whatsapps);
  return { enviados, encerrados };
}

/** O retrato da campanha, para a tela mostrar ANTES do disparo. */
export async function panoramaDaCampanha(escritorioId: string) {
  const [canais, { temTelefone }, grupos, semCodigo] = await Promise.all([
    canaisDaCampanha(escritorioId),
    bancaDoEscritorio(escritorioId),
    comEscritorio(escritorioId, (db) => db.codigoDeAtendimento.groupBy({ by: ["avisoEtapa"], _count: { _all: true } })),
    comEscritorio(escritorioId, (db) => db.cliente.count({ where: { codigoDeAtendimento: null } })),
  ]);
  const porEtapa = Object.fromEntries(grupos.map((g) => [g.avisoEtapa, g._count._all])) as Record<number, number>;
  const comCodigo = grupos.reduce((t, g) => t + g._count._all, 0);
  return {
    canais,
    temTelefone,
    semCodigo,
    comCodigo,
    naoAvisados: porEtapa[0] ?? 0,
    emCampanha: [1, 2, 3, 4].reduce((t, e) => t + (porEtapa[e] ?? 0), 0),
    concluiram: porEtapa[TOTAL_DE_AVISOS] ?? 0,
  };
}
