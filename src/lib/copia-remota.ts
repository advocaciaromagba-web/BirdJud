// Copia do backup para fora do Railway, em armazenamento compativel com S3.
//
// POR QUE EXISTE: o plano do Railway nao faz backup nenhum do volume
// (maxBackupsCount: 0). O backup diario roda, e conferido e tem ensaio de
// restauracao — mas grava no MESMO provedor que ele deveria proteger. Um
// incidente la leva o banco e a copia junto, e ensaio de restauracao nao
// serve de nada sem de onde restaurar.
//
// POR QUE SEM SDK: o @aws-sdk/client-s3 traz alguns megabytes para fazer um
// PUT. A assinatura SigV4 e um procedimento fechado e curto, e escrita aqui
// ela fica testavel — o que importa num caminho que so e exercitado de
// verdade no dia em que der ruim.
//
// POR QUE COMPATIVEL COM S3, E NAO "R2": Cloudflare R2 e Backblaze B2 falam
// o mesmo protocolo. Escrever para o protocolo em vez de para o fornecedor
// significa que trocar de um para o outro e trocar duas variaveis.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";

export class CopiaRemotaMalConfigurada extends Error {
  constructor(motivo: string) {
    super(`Copia remota do backup: ${motivo}`);
    this.name = "CopiaRemotaMalConfigurada";
  }
}

export type Destino = {
  /** Ex.: https://<conta>.r2.cloudflarestorage.com */
  endereco: string;
  balde: string;
  chave: string;
  segredo: string;
  /** R2 usa "auto"; a B2 usa a regiao dela. */
  regiao: string;
};

/**
 * Le o destino do ambiente.
 *
 * NAO usa AWS_ACCESS_KEY_ID nem AWS_SECRET_ACCESS_KEY de proposito: essas
 * variaveis existem em muitos ambientes por outro motivo, e pegar carona
 * nelas faria o backup ir parar em um balde que ninguem escolheu.
 */
export function destinoDoAmbiente(): Destino | null {
  const endereco = process.env.BACKUP_S3_ENDERECO?.trim();
  const balde = process.env.BACKUP_S3_BALDE?.trim();
  const chave = process.env.BACKUP_S3_CHAVE?.trim();
  const segredo = process.env.BACKUP_S3_SEGREDO?.trim();
  if (!endereco && !balde && !chave && !segredo) return null;

  const faltando = [
    ["BACKUP_S3_ENDERECO", endereco],
    ["BACKUP_S3_BALDE", balde],
    ["BACKUP_S3_CHAVE", chave],
    ["BACKUP_S3_SEGREDO", segredo],
  ]
    .filter(([, valor]) => !valor)
    .map(([nome]) => nome);

  // Configuracao pela metade e o pior estado: parece configurada e nao copia.
  if (faltando.length) {
    throw new CopiaRemotaMalConfigurada(`faltam ${faltando.join(", ")}.`);
  }

  return {
    endereco: endereco!.replace(/\/+$/, ""),
    balde: balde!,
    chave: chave!,
    segredo: segredo!,
    regiao: process.env.BACKUP_S3_REGIAO?.trim() || "auto",
  };
}

function sha256(dado: string | Buffer): string {
  return createHash("sha256").update(dado).digest("hex");
}

function hmac(chave: Buffer | string, dado: string): Buffer {
  return createHmac("sha256", chave).update(dado).digest();
}

/** aaaammddThhmmssZ e aaaammdd, que e o formato que o SigV4 exige. */
export function carimbos(agora: Date): { longo: string; curto: string } {
  const longo = `${agora.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
  return { longo, curto: longo.slice(0, 8) };
}

/**
 * Cada segmento do caminho vai percent-encoded, e a barra NAO.
 *
 * Nome de arquivo com dois-pontos (que o nosso carimbo de hora tem) precisa
 * disso: sem codificar, a assinatura calculada aqui e a calculada pelo
 * servidor deixam de bater, e o erro que volta e um 403 sem explicacao.
 */
export function caminhoCanonico(chaveDoObjeto: string): string {
  return chaveDoObjeto
    .split("/")
    .map((parte) => encodeURIComponent(parte).replace(/[!'()*]/g, (c) =>
      `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    ))
    .join("/");
}

/**
 * A consulta tambem e assinada, e a ordem importa.
 *
 * Isto faltava, e o sintoma foi um 403 mudo ao LISTAR o balde — justamente
 * a operacao que so se usa no dia da restauracao. Parametros vao ordenados
 * por nome e percent-encoded; e o que o SigV4 manda, e o servidor refaz a
 * mesma conta do lado dele.
 */
export function consultaCanonica(consulta: Record<string, string>): string {
  return Object.keys(consulta)
    .sort()
    .map(
      (nome) =>
        `${encodeURIComponent(nome)}=${encodeURIComponent(consulta[nome])}`,
    )
    .join("&");
}

export type Assinatura = {
  url: string;
  cabecalhos: Record<string, string>;
  /** Exposto para teste: e aqui que erra quem erra SigV4. */
  requisicaoCanonica: string;
};

/**
 * Monta a requisicao assinada.
 *
 * O metodo entra na requisicao canonica, entao ele e parametro: assinar um
 * HEAD como se fosse PUT produz assinatura invalida, e o servidor devolve
 * 403 sem dizer por que.
 */
export function assinar(
  destino: Destino,
  metodo: "PUT" | "HEAD" | "GET",
  chaveDoObjeto: string,
  corpoSha256: string,
  tamanho: number,
  agora: Date,
  consulta: Record<string, string> = {},
): Assinatura {
  const { longo, curto } = carimbos(agora);
  const host = new URL(destino.endereco).host;
  // Montado a partir dos segmentos que existem: balde vazio (quando ele vem
  // no nome do host, como alguns provedores fazem) nao pode produzir "//",
  // que muda o caminho canonico e invalida a assinatura.
  const caminho = `/${[destino.balde, caminhoCanonico(chaveDoObjeto)]
    .filter(Boolean)
    .join("/")}`;

  const cabecalhosAssinados: Record<string, string> = {
    host,
    "x-amz-content-sha256": corpoSha256,
    "x-amz-date": longo,
  };
  const nomes = Object.keys(cabecalhosAssinados).sort();
  const canonicos = nomes.map((n) => `${n}:${cabecalhosAssinados[n]}\n`).join("");
  const listaDeNomes = nomes.join(";");

  const requisicaoCanonica = [
    metodo,
    caminho,
    consultaCanonica(consulta),
    canonicos,
    listaDeNomes,
    corpoSha256,
  ].join("\n");

  const escopo = `${curto}/${destino.regiao}/s3/aws4_request`;
  const paraAssinar = [
    "AWS4-HMAC-SHA256",
    longo,
    escopo,
    sha256(requisicaoCanonica),
  ].join("\n");

  const chaveData = hmac(`AWS4${destino.segredo}`, curto);
  const chaveRegiao = hmac(chaveData, destino.regiao);
  const chaveServico = hmac(chaveRegiao, "s3");
  const chaveAssinatura = hmac(chaveServico, "aws4_request");
  const assinatura = createHmac("sha256", chaveAssinatura)
    .update(paraAssinar)
    .digest("hex");

  const query = consultaCanonica(consulta);
  return {
    url: `${destino.endereco}${caminho}${query ? `?${query}` : ""}`,
    requisicaoCanonica,
    cabecalhos: {
      ...cabecalhosAssinados,
      ...(metodo === "PUT" ? { "content-length": String(tamanho) } : {}),
      authorization:
        `AWS4-HMAC-SHA256 Credential=${destino.chave}/${escopo}, ` +
        `SignedHeaders=${listaDeNomes}, Signature=${assinatura}`,
    },
  };
}

export type ObjetoNoBalde = {
  chave: string;
  tamanho: number;
  modificadoEm: Date;
};

/**
 * Lista o que esta no balde, sob um prefixo.
 *
 * XML lido por expressao regular de proposito: sao tres campos de uma
 * resposta de formato fixo, e trazer um analisador de XML para isto seria
 * mais codigo e mais dependencia do que o problema pede.
 */
export async function listarObjetos(
  destino: Destino,
  prefixo: string,
  agora: Date = new Date(),
): Promise<ObjetoNoBalde[]> {
  const vazio = sha256(Buffer.alloc(0));
  const a = assinar(destino, "GET", "", vazio, 0, agora, {
    "list-type": "2",
    prefix: prefixo,
  });
  const resposta = await fetch(a.url, { headers: a.cabecalhos });
  if (!resposta.ok) {
    throw new FalhaNaCopia(`HTTP ${resposta.status} ao listar ${prefixo}.`);
  }
  return interpretarListagem(await resposta.text());
}

/** Separado da rede para poder ser testado com uma resposta de verdade. */
export function interpretarListagem(xml: string): ObjetoNoBalde[] {
  const itens: ObjetoNoBalde[] = [];
  for (const bloco of xml.split("<Contents>").slice(1)) {
    const chave = bloco.match(/<Key>([^<]*)<\/Key>/)?.[1];
    const data = bloco.match(/<LastModified>([^<]*)<\/LastModified>/)?.[1];
    const tamanho = bloco.match(/<Size>(\d+)<\/Size>/)?.[1];
    if (!chave || !data) continue;
    const modificadoEm = new Date(data);
    if (Number.isNaN(modificadoEm.getTime())) continue;
    itens.push({ chave, tamanho: Number(tamanho ?? 0), modificadoEm });
  }
  return itens;
}

/** Quantas horas sem copia nova antes de acusar. */
export const HORAS_ATE_ACUSAR = 30;

/**
 * A copia mais nova ainda esta dentro do prazo?
 *
 * Devolve o motivo, ou null quando esta tudo bem. O backup roda uma vez por
 * dia, entao a copia mais nova tem no maximo 24 horas; 30 da seis horas de
 * folga para atraso de fila sem virar alarme falso — e alarme falso em
 * backup e pior que silencio, porque ensina a ignorar.
 */
export function avaliarCopias(
  objetos: ObjetoNoBalde[],
  agora: Date = new Date(),
  horas: number = HORAS_ATE_ACUSAR,
): string | null {
  if (objetos.length === 0) {
    return "Nao ha NENHUMA copia do banco no armazenamento externo.";
  }

  const maisNova = objetos.reduce((a, b) =>
    a.modificadoEm > b.modificadoEm ? a : b,
  );
  const idade = (agora.getTime() - maisNova.modificadoEm.getTime()) / 3_600_000;

  if (idade > horas) {
    return (
      `A copia mais nova do banco tem ${Math.floor(idade)} horas ` +
      `(${maisNova.chave}). O backup roda todo dia — isto significa que ele ` +
      "parou de subir."
    );
  }

  // Zero byte e o unico tamanho que acusa: o script ja confere o conteudo do
  // dump antes de enviar, e inventar um piso aqui produziria alarme falso no
  // dia em que o banco estivesse legitimamente pequeno.
  if (maisNova.tamanho === 0) {
    return `A copia mais nova (${maisNova.chave}) esta com zero byte.`;
  }

  return null;
}

export class FalhaNaCopia extends Error {
  constructor(motivo: string) {
    super(`Copia remota falhou: ${motivo}`);
    this.name = "FalhaNaCopia";
  }
}

/**
 * Envia o objeto e CONFERE que ele chegou.
 *
 * A conferencia nao e zelo: "enviei" sem conferir e exatamente o erro do
 * dump que parecia backup e estava vazio por dentro. Aqui o HEAD depois do
 * PUT le o tamanho de volta do servidor.
 */
export async function enviarObjeto(
  destino: Destino,
  chaveDoObjeto: string,
  corpo: Buffer,
  agora: Date = new Date(),
): Promise<{ url: string; tamanho: number }> {
  const digest = sha256(corpo);
  const { url, cabecalhos } = assinar(
    destino,
    "PUT",
    chaveDoObjeto,
    digest,
    corpo.byteLength,
    agora,
  );

  const resposta = await fetch(url, {
    method: "PUT",
    headers: cabecalhos,
    body: new Uint8Array(corpo),
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    throw new FalhaNaCopia(
      `HTTP ${resposta.status} ao enviar ${chaveDoObjeto}. ${detalhe.slice(0, 300)}`,
    );
  }

  // O HEAD tambem e assinado, e com o digest do corpo VAZIO — e o que o
  // protocolo pede para requisicao sem corpo.
  const vazio = sha256(Buffer.alloc(0));
  const conferencia = await fetch(url, {
    method: "HEAD",
    headers: assinar(destino, "HEAD", chaveDoObjeto, vazio, 0, new Date())
      .cabecalhos,
  }).catch(() => null);

  const tamanhoLido = Number(conferencia?.headers.get("content-length") ?? -1);
  if (!conferencia?.ok || tamanhoLido !== corpo.byteLength) {
    throw new FalhaNaCopia(
      `o objeto nao voltou com o tamanho enviado (${tamanhoLido} != ${corpo.byteLength}).`,
    );
  }

  return { url, tamanho: corpo.byteLength };
}


// ---------------------------------------------------------------------------
// Cifra do backup
// ---------------------------------------------------------------------------
//
// O dump leva nome, CPF e processo de cliente de todos os escritorios. Ele
// nao vai para um balde de terceiro em texto claro — nem por confianca no
// fornecedor, mas porque uma chave de acesso vazada nao pode virar
// vazamento de dado de cliente.
//
// A chave e PROPRIA (BACKUP_CHAVE), separada da SEGREDO_CHAVE, por dois
// motivos: quem restaura backup nao precisa da chave que decifra as
// credenciais dos escritorios, e trocar uma nao invalida a outra.
//
// AVISO QUE PRECISA SER DITO EM VOZ ALTA: backup cifrado sem a chave e
// lixo. A BACKUP_CHAVE tem de existir FORA do Railway — em gerenciador de
// senhas, em papel, onde for. Se o Railway sumir com o banco, com a copia e
// com a chave ao mesmo tempo, a copia remota nao serviu para nada.

const ALGORITMO = "aes-256-gcm";
const TAMANHO_IV = 12;
/** Marca no comeco do arquivo, para nao tentar decifrar um dump em claro. */
export const MARCA = Buffer.from("BIRDJUD1");

export function chaveDoBackup(): Buffer | null {
  const bruta = process.env.BACKUP_CHAVE?.trim();
  if (!bruta) return null;
  const buf = Buffer.from(bruta, "base64");
  if (buf.length !== 32) {
    throw new CopiaRemotaMalConfigurada(
      "BACKUP_CHAVE precisa ter 32 bytes em base64 (gere com: openssl rand -base64 32).",
    );
  }
  return buf;
}

/** Formato: [marca (8) | iv (12) | tag (16) | conteudo cifrado]. */
export function cifrarBackup(conteudo: Buffer, chave: Buffer): Buffer {
  const iv = randomBytes(TAMANHO_IV);
  const cifra = createCipheriv(ALGORITMO, chave, iv);
  const dados = Buffer.concat([cifra.update(conteudo), cifra.final()]);
  return Buffer.concat([MARCA, iv, cifra.getAuthTag(), dados]);
}

export function decifrarBackup(pacote: Buffer, chave: Buffer): Buffer {
  if (!pacote.subarray(0, MARCA.length).equals(MARCA)) {
    throw new FalhaNaCopia(
      "este arquivo nao foi cifrado pelo BirdJud (falta a marca).",
    );
  }
  const iv = pacote.subarray(MARCA.length, MARCA.length + TAMANHO_IV);
  const tag = pacote.subarray(
    MARCA.length + TAMANHO_IV,
    MARCA.length + TAMANHO_IV + 16,
  );
  const decifra = createDecipheriv(ALGORITMO, chave, iv);
  decifra.setAuthTag(tag);
  // A tag do GCM faz decipher.final() levantar se um byte tiver mudado no
  // caminho. E o que transforma "o arquivo chegou" em "o arquivo chegou
  // inteiro".
  return Buffer.concat([
    decifra.update(pacote.subarray(MARCA.length + TAMANHO_IV + 16)),
    decifra.final(),
  ]);
}
