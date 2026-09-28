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
