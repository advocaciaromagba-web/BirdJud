// O resumo do dia: o que hoje reserva, antes de alguem abrir o sistema.
//
// O painel ja mostra isto a quem entra. O valor do resumo e CHEGAR SOZINHO, de
// manha, a quem ainda nao abriu — e e por isso que a regra mais importante
// deste arquivo nao e sobre o que mandar, e sobre quando NAO mandar.
//
// DIA SEM NADA NAO GERA MENSAGEM. Um resumo que diz "nada para hoje" todo dia
// ensina a pessoa a ignorar o resumo — e no dia em que ele trouxer um prazo
// vencendo, ela nao vai ler.
//
// Nada aqui toca banco. So recebe os fatos do dia e decide o que dizer.

export type PrazoNoResumo = {
  titulo: string;
  /** "AAAA-MM-DD". */
  vencimento: string;
  numeroProcesso: string | null;
};

export type CompromissoNoResumo = {
  titulo: string;
  tipo: string;
  /** "14:30". */
  hora: string;
  local: string | null;
};

export type FatosDoDia = {
  /** Prazos que venceram e ninguem cumpriu. */
  prazosVencidos: PrazoNoResumo[];
  prazosHoje: PrazoNoResumo[];
  /** Vence no proximo dia util (na sexta, o da segunda). */
  prazosAmanha: PrazoNoResumo[];
  /** Vence em 2 a 4 dias uteis: da tempo de fazer, se comecar agora. */
  prazosProximos: PrazoNoResumo[];
  compromissosHoje: CompromissoNoResumo[];
  /** So a contagem: a lista inteira iria para a tela, nao para o e-mail. */
  audienciasAmanha: number;
  publicacoesNovas: number;
};

export type Resumo = {
  fatos: FatosDoDia;
  /** Nada que mereca uma mensagem. */
  vazio: boolean;
  /** O que mais pesa, para o assunto do e-mail. */
  assunto: string;
  /** Uma linha, para o WhatsApp. */
  linha: string;
};

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/**
 * Vale uma mensagem?
 *
 * Publicacao nova sozinha NAO vale: ela ja tem o resumo de publicacoes, que
 * sai no mesmo horario, e duas mensagens dizendo a mesma coisa e o caminho
 * mais curto para as duas serem ignoradas.
 */
export function mereceMensagem(f: FatosDoDia): boolean {
  return (
    f.prazosVencidos.length > 0 ||
    f.prazosHoje.length > 0 ||
    f.prazosAmanha.length > 0 ||
    f.prazosProximos.length > 0 ||
    f.compromissosHoje.length > 0 ||
    f.audienciasAmanha > 0
  );
}

/**
 * O assunto do e-mail: o que mais pesa, nao a soma de tudo.
 *
 * A ordem e a de quem perde mais: prazo vencido perde direito, prazo de hoje
 * esta a horas de perder, audiencia nao se remarca por esquecimento.
 */
export function assuntoDoResumo(f: FatosDoDia, nomeDoEscritorio: string): string {
  const inicio = `${nomeDoEscritorio} — seu dia`;
  if (f.prazosVencidos.length > 0) {
    return `${inicio}: ${plural(f.prazosVencidos.length, "prazo vencido", "prazos vencidos")}`;
  }
  if (f.prazosHoje.length > 0) {
    return `${inicio}: ${plural(f.prazosHoje.length, "prazo vence hoje", "prazos vencem hoje")}`;
  }
  if (f.compromissosHoje.length > 0) {
    return `${inicio}: ${plural(f.compromissosHoje.length, "compromisso", "compromissos")}`;
  }
  if (f.prazosAmanha.length > 0) {
    return `${inicio}: ${plural(f.prazosAmanha.length, "prazo vence no próximo dia útil", "prazos vencem no próximo dia útil")}`;
  }
  if (f.prazosProximos.length > 0) {
    return `${inicio}: ${plural(f.prazosProximos.length, "prazo nos próximos 4 dias úteis", "prazos nos próximos 4 dias úteis")}`;
  }
  return `${inicio}: ${plural(f.audienciasAmanha, "audiência amanhã", "audiências amanhã")}`;
}

/** Uma linha so, para o WhatsApp: numeros, nao narrativa. */
export function linhaDoResumo(f: FatosDoDia): string {
  const partes: string[] = [];
  if (f.prazosVencidos.length > 0) {
    partes.push(`${plural(f.prazosVencidos.length, "prazo vencido", "prazos vencidos")}`);
  }
  if (f.prazosHoje.length > 0) partes.push(`${f.prazosHoje.length} vencendo hoje`);
  if (f.prazosAmanha.length > 0) partes.push(`${f.prazosAmanha.length} no próximo dia útil`);
  if (f.prazosProximos.length > 0) partes.push(`${f.prazosProximos.length} nos próximos 4 dias úteis`);
  if (f.compromissosHoje.length > 0) {
    partes.push(plural(f.compromissosHoje.length, "compromisso hoje", "compromissos hoje"));
  }
  if (f.audienciasAmanha > 0) {
    partes.push(plural(f.audienciasAmanha, "audiência amanhã", "audiências amanhã"));
  }
  if (f.publicacoesNovas > 0) {
    partes.push(plural(f.publicacoesNovas, "publicação nova", "publicações novas"));
  }
  return partes.join(", ") + ".";
}

function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function emBR(iso: string): string {
  return iso.split("-").reverse().join("/");
}

function lista(itens: string[]): string {
  return `<ul style="margin:6px 0 14px;padding-left:18px">${itens
    .map((i) => `<li style="margin:3px 0">${i}</li>`)
    .join("")}</ul>`;
}

function linhaDePrazo(p: PrazoNoResumo, comData: boolean): string {
  const processo = p.numeroProcesso ? ` — ${escapar(p.numeroProcesso)}` : "";
  const data = comData ? ` (${emBR(p.vencimento)})` : "";
  return `<strong>${escapar(p.titulo)}</strong>${processo}${data}`;
}

/** O corpo do e-mail. O que vem primeiro e o que se perde primeiro. */
export function corpoDoResumo(
  f: FatosDoDia,
  nomeDoEscritorio: string,
  endereco: string,
): string {
  const blocos: string[] = [];

  if (f.prazosVencidos.length > 0) {
    blocos.push(
      `<p style="margin:0 0 4px"><strong style="color:#b45309">Prazo vencido e não cumprido</strong></p>` +
        lista(f.prazosVencidos.map((p) => linhaDePrazo(p, true))),
    );
  }
  if (f.prazosHoje.length > 0) {
    blocos.push(
      `<p style="margin:0 0 4px"><strong>Vence hoje</strong></p>` +
        lista(f.prazosHoje.map((p) => linhaDePrazo(p, false))),
    );
  }
  if (f.compromissosHoje.length > 0) {
    blocos.push(
      `<p style="margin:0 0 4px"><strong>Hoje na agenda</strong></p>` +
        lista(
          f.compromissosHoje.map(
            (c) =>
              `${c.hora} — ${escapar(c.titulo)}` +
              `${c.local ? ` (${escapar(c.local)})` : ""}`,
          ),
        ),
    );
  }
  if (f.prazosAmanha.length > 0) {
    blocos.push(
      `<p style="margin:0 0 4px"><strong>Vence no próximo dia útil</strong></p>` +
        lista(f.prazosAmanha.map((p) => linhaDePrazo(p, true))),
    );
  }
  if (f.prazosProximos.length > 0) {
    blocos.push(
      `<p style="margin:0 0 4px"><strong>Prazo fatal nos próximos 4 dias úteis</strong></p>` +
        lista(f.prazosProximos.map((p) => linhaDePrazo(p, true))),
    );
  }

  const rodape: string[] = [];
  if (f.audienciasAmanha > 0) {
    rodape.push(plural(f.audienciasAmanha, "audiência amanhã", "audiências amanhã"));
  }
  if (f.publicacoesNovas > 0) {
    rodape.push(plural(f.publicacoesNovas, "publicação nova", "publicações novas"));
  }

  return (
    `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;color:#0f172a">` +
    `<p style="margin:0 0 14px">Bom dia. O que o dia reserva no ${escapar(nomeDoEscritorio)}:</p>` +
    blocos.join("") +
    (rodape.length > 0
      ? `<p style="margin:0 0 14px;color:#475569">Também: ${rodape.join(", ")}.</p>`
      : "") +
    `<p style="margin:16px 0 0"><a href="${endereco}" style="color:#1e293b">Abrir o sistema</a></p>` +
    `</div>`
  );
}

export function montarResumo(
  f: FatosDoDia,
  nomeDoEscritorio: string,
): Resumo {
  const vazio = !mereceMensagem(f);
  return {
    fatos: f,
    vazio,
    assunto: vazio ? "" : assuntoDoResumo(f, nomeDoEscritorio),
    linha: vazio ? "" : linhaDoResumo(f),
  };
}
