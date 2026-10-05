/**
 * Conferencia do certificado dos dominios proprios.
 *
 * POR QUE ISTO EXISTE: em 28/09/2026 o certificado do curinga
 * *.birdjud.com.br entrou em ISSUE_FAILED no Railway. Resultado: a borda
 * passou a responder com o certificado padrao do provedor
 * (CN=*.up.railway.app), o navegador recusou o TLS e NINGUEM conseguiu
 * entrar no sistema — app.birdjud.com.br e todos os subdominios de
 * escritorio, fora do ar. O vigia nao viu nada, porque ele batia no
 * dominio interno do Railway, onde o certificado e outro.
 *
 * A licao e estreita e vale registrar: healthcheck verde nao quer dizer
 * sistema acessivel. Quem responde ao usuario e a borda com o dominio
 * proprio, e e o certificado dela que precisa ser vigiado.
 *
 * REGRA DE ALARME: so acusamos o que temos certeza. Handshake que completa
 * com certificado que nao cobre o host e falha (foi exatamente o caso
 * acima). Ja "nao consegui conectar" pode ser a rede do container, e
 * alarme falso ensina todo mundo a ignorar o alarme — isso vira
 * INCONCLUSIVO, que registra e nao acorda ninguem.
 *
 * LIMITE CONHECIDO: a conferencia le o certificado que a conexao entrega. Se
 * houver um proxy TLS no caminho — como acontece em alguns ambientes de
 * desenvolvimento —, quem responde e o proxy, com um certificado que casa
 * com qualquer nome, e a conferencia diz "ok" sempre. No cron-vigia do
 * Railway a saida e direta, que e onde ela precisa valer; rodar o vigia por
 * tras de um proxy nao prova nada sobre a borda de producao.
 */

/** Dias de antecedencia para avisar que o certificado esta por vencer. */
export const DIAS_DE_AVISO = 7;

export type Veredito =
  | { situacao: "ok"; nomes: string[]; expiraEm: number }
  | { situacao: "falha"; motivo: string }
  | { situacao: "inconclusivo"; motivo: string };

/**
 * Um nome do certificado cobre o host?
 *
 * O curinga cobre UM rotulo, e so o da esquerda: *.birdjud.com.br vale para
 * app.birdjud.com.br, nao para a.b.birdjud.com.br nem para o proprio
 * birdjud.com.br. E como o navegador faz, e e por isso que o apice e o
 * curinga sao dois dominios separados no Railway.
 */
export function nomeCobre(nome: string, host: string): boolean {
  const n = nome.trim().toLowerCase().replace(/\.$/, "");
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  if (!n || !h) return false;
  if (n === h) return true;
  if (!n.startsWith("*.")) return false;
  const sufixo = n.slice(1); // ".birdjud.com.br"
  if (!h.endsWith(sufixo)) return false;
  const rotulo = h.slice(0, h.length - sufixo.length);
  return rotulo.length > 0 && !rotulo.includes(".");
}

/** Nomes que um certificado apresenta: o CN mais os SAN de DNS. */
export function nomesDoCertificado(certificado: {
  subject?: { CN?: string | string[] } | null;
  subjectaltname?: string;
}): string[] {
  const nomes = new Set<string>();
  const cn = certificado.subject?.CN;
  for (const valor of Array.isArray(cn) ? cn : cn ? [cn] : []) nomes.add(valor);
  for (const parte of (certificado.subjectaltname ?? "").split(",")) {
    const achado = parte.trim();
    if (achado.toLowerCase().startsWith("dns:")) nomes.add(achado.slice(4));
  }
  return [...nomes].filter(Boolean);
}

/**
 * Le o certificado ja obtido e diz se ele serve para o host.
 *
 * Separado da rede de proposito: e aqui que mora a decisao de acordar
 * alguem, e decisao precisa de teste.
 */
export function julgar(
  host: string,
  certificado: {
    subject?: { CN?: string | string[] } | null;
    subjectaltname?: string;
    valid_to?: string;
  } | null,
  agora: Date,
): Veredito {
  if (!certificado || Object.keys(certificado).length === 0) {
    return { situacao: "inconclusivo", motivo: "a borda nao apresentou certificado" };
  }

  const nomes = nomesDoCertificado(certificado);
  if (nomes.length === 0) {
    return { situacao: "inconclusivo", motivo: "certificado sem nome legivel" };
  }

  if (!nomes.some((nome) => nomeCobre(nome, host))) {
    return {
      situacao: "falha",
      motivo:
        `o certificado apresentado nao cobre ${host} — ` +
        `a borda entregou ${nomes.join(", ")}. ` +
        "No Railway: dominio > certificado; se estiver em falha, reemitir.",
    };
  }

  const vence = certificado.valid_to ? new Date(certificado.valid_to) : null;
  if (!vence || Number.isNaN(vence.getTime())) {
    // Cobre o host, e isso e o que derruba o acesso. Validade ilegivel nao
    // vira alarme.
    return { situacao: "ok", nomes, expiraEm: Number.POSITIVE_INFINITY };
  }

  const dias = Math.floor((vence.getTime() - agora.getTime()) / 86_400_000);
  if (dias < 0) {
    return { situacao: "falha", motivo: `o certificado de ${host} venceu em ${certificado.valid_to}` };
  }
  if (dias < DIAS_DE_AVISO) {
    return {
      situacao: "falha",
      motivo: `o certificado de ${host} vence em ${dias} dia(s) (${certificado.valid_to}) e nao foi renovado`,
    };
  }
  return { situacao: "ok", nomes, expiraEm: dias };
}

/**
 * Onde o vigia vai bater para ver o certificado de um nome.
 *
 * POR QUE ISTO EXISTE: com uma borda de terceiro na frente (Cloudflare), quem
 * responde no nome publico e ela, com um certificado dela, sempre valido. O
 * certificado do NOSSO servidor passa a vencer em silencio — e foi exatamente
 * um certificado nosso em falha que deixou o sistema inteiro fora do ar em
 * 28/09/2026. A conferencia precisa poder bater na origem, por tras da borda.
 *
 * A origem e um endereco diferente do nome publico; o que decide qual
 * certificado o servidor apresenta e o SNI, que continua sendo o nome
 * PUBLICO. Conectar sem SNI nao da erro: da o certificado padrao do servidor
 * (DNS:default.domain no Railway). Essa e a armadilha — o vigia acusaria
 * falha todo dia por conta propria, e alarme falso diario e pior que nenhum
 * alarme, porque ensina a ignorar.
 *
 * Conferido no cron-vigia em 05/10/2026, que e onde a saida e direta:
 *
 *   tzp59u2a.up.railway.app com SNI birdjud.com.br      -> birdjud.com.br
 *   qj91rgxj.up.railway.app com SNI app.birdjud.com.br  -> *.birdjud.com.br
 *
 * Os dois enderecos devolvem certificados DIFERENTES, e so o SNI os separa:
 * e a prova de que ele esta sendo mandado.
 *
 * ONDE MEDIR IMPORTA, e isto custou uma afirmacao errada: a mesma conferencia
 * rodada de um ambiente com proxy TLS na frente devolveu CN=*.com.br, emissor
 * "Egress Gateway SDS Issuing CA", com outra validade. Era o certificado do
 * proxy, nao o do Railway. E o limite ja anotado no topo deste arquivo, e ele
 * vale para quem le o resultado tanto quanto para quem escreve o codigo.
 */
export type AlvoDeCertificado = {
  /** Nome publico. E o que vai no SNI e o que o certificado precisa cobrir. */
  nome: string;
  /** Onde conectar. Igual ao nome quando nao ha borda de terceiro na frente. */
  origem: string;
};

/**
 * Le a lista de alvos. Cada item e `nome` ou `nome@origem`.
 *
 * Item vazio ou malformado e DESCARTADO, nao vira alvo quebrado: uma virgula
 * sobrando na configuracao nao deve produzir alarme sobre um host "".
 */
export function alvosDeCertificado(texto: string | undefined | null): AlvoDeCertificado[] {
  const alvos: AlvoDeCertificado[] = [];
  for (const parte of (texto ?? "").split(",")) {
    const item = parte.trim();
    if (!item) continue;
    const corte = item.indexOf("@");
    if (corte < 0) {
      alvos.push({ nome: item.toLowerCase(), origem: item.toLowerCase() });
      continue;
    }
    const nome = item.slice(0, corte).trim().toLowerCase();
    const origem = item.slice(corte + 1).trim().toLowerCase();
    if (!nome) continue;
    // Origem vazia depois do "@" e engano de digitacao, nao pedido de
    // conectar no nome: descartar é melhor que adivinhar.
    if (!origem) continue;
    alvos.push({ nome, origem });
  }
  return alvos;
}

/** Como dizer o alvo no log e no alarme, para saber onde foi batido. */
export function descreverAlvo(alvo: AlvoDeCertificado): string {
  return alvo.origem === alvo.nome
    ? alvo.nome
    : `${alvo.nome} (na origem ${alvo.origem})`;
}
