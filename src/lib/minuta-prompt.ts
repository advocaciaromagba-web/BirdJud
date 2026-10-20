// O texto para a peticao inicial, montado da entrevista organizada e do
// cadastro do cliente. Espelhado do sistema da Advocacia Roma.
//
// E deliberadamente restritivo: manda marcar lacuna com [PREENCHER] em vez de
// inventar fato, e proibe criar prova ou documento que nao foi mencionado na
// entrevista. Peticao inicial com fato inventado e problema serio, e o
// modelo que vai redigir nao conhece o caso alem do que vai aqui.
import type { AnaliseDaEntrevista } from "./entrevista";

export type ClienteParaMinuta = {
  nome: string;
  documento: string | null;
  rg: string | null;
  nacionalidade: string | null;
  estadoCivil: string | null;
  profissao: string | null;
  email: string | null;
  telefone: string | null;
  endereco: {
    logradouro?: string | null;
    rua?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
    cep?: string | null;
  } | null;
};

export type AdvogadoParaMinuta = {
  nome: string;
  oab: string | null;
  escritorio: string | null;
};

const vazio = (v: string | null | undefined) => !v || !String(v).trim();

/** Campos sem os quais a qualificacao da inicial fica incompleta (CPC 319, II). */
export function camposFaltando(c: ClienteParaMinuta): string[] {
  const e = c.endereco ?? {};
  const campos: [string | null | undefined, string][] = [
    [c.nome, "Nome completo"],
    [c.documento, "CPF/CNPJ"],
    [c.nacionalidade, "Nacionalidade"],
    [c.estadoCivil, "Estado civil"],
    [c.profissao, "Profissao"],
    [e.logradouro ?? e.rua, "Rua/Logradouro"],
    [e.numero, "Numero"],
    [e.bairro, "Bairro"],
    [e.cidade, "Cidade"],
    [e.uf, "UF"],
    [e.cep, "CEP"],
  ];
  return campos.filter(([v]) => vazio(v)).map(([, rotulo]) => rotulo);
}

function qualificacao(c: ClienteParaMinuta): string {
  const falta = (v: string | null | undefined, rotulo: string) => (v && v.trim() ? v.trim() : `[PREENCHER: ${rotulo}]`);
  const e = c.endereco ?? {};
  const endereco = [
    falta(e.logradouro ?? e.rua, "rua"),
    falta(e.numero, "numero"),
    e.complemento?.trim() || null,
    falta(e.bairro, "bairro"),
    `${falta(e.cidade, "cidade")}/${falta(e.uf, "UF")}`,
    `CEP ${falta(e.cep, "CEP")}`,
  ]
    .filter(Boolean)
    .join(", ");

  return [
    `Nome: ${falta(c.nome, "nome completo")}`,
    `Nacionalidade: ${falta(c.nacionalidade, "nacionalidade")}`,
    `Estado civil: ${falta(c.estadoCivil, "estado civil")}`,
    `Profissao: ${falta(c.profissao, "profissao")}`,
    // RG so aparece quando existe: a Carteira de Identidade Nacional adotou o
    // CPF como numero unico, e "PREENCHER: RG" abriria lacuna na peca de quem
    // simplesmente nao tem mais esse numero.
    c.rg?.trim() ? `RG: ${c.rg.trim()}` : null,
    `CPF/CNPJ: ${falta(c.documento, "CPF")}`,
    `Endereco: ${endereco}`,
    `E-mail: ${c.email?.trim() || "[PREENCHER: e-mail]"}`,
    `Telefone: ${c.telefone?.trim() || "[PREENCHER: telefone]"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function bloco(titulo: string, itens: string[], semNada: string): string {
  if (itens.length === 0) return `${titulo}\n- ${semNada}`;
  return `${titulo}\n${itens.map((i) => `- ${i}`).join("\n")}`;
}

export function montarPromptMinuta(
  cliente: ClienteParaMinuta,
  advogado: AdvogadoParaMinuta,
  analise: AnaliseDaEntrevista,
  observacoesAdvogado: string,
): string {
  const faltando = camposFaltando(cliente);
  const partes: string[] = [];

  partes.push(
    "Você é advogado(a) brasileiro(a) e vai redigir uma PETICAO INICIAL completa, pronta para protocolo, " +
      "a partir das informações colhidas na entrevista de triagem abaixo.",
    "",
    "REGRAS QUE VOCE DEVE SEGUIR:",
    "1. Use SOMENTE os fatos descritos abaixo. Não invente fato, data, valor, documento ou testemunha.",
    "2. Onde faltar informação necessária, escreva [PREENCHER: o que falta] no meio do texto. Não preencha por conta própria.",
    "3. Não afirme a existência de documento que não conste na lista de documentos disponíveis.",
    "4. Indique a fundamentação jurídica com artigos de lei, súmulas e teses aplicáveis, mas revise: " +
      "não cite precedente do qual não tenha certeza.",
    "5. Formule os pedidos de forma certa e determinada, cada um em item próprio.",
    "6. Ao final, liste separadamente as PENDENCIAS que o advogado precisa resolver antes do protocolo.",
    "",
    "ESTRUTURA EXIGIDA (CPC, art. 319):",
    "- Enderecamento ao juízo competente",
    "- Qualificação completa das partes",
    "- DOS FATOS",
    "- DO DIREITO",
    "- DA TUTELA DE URGENCIA (somente se os fatos justificarem; caso contrário, omita a seção)",
    "- DOS PEDIDOS",
    "- DAS PROVAS",
    "- DO VALOR DA CAUSA",
    "- Fecho, local, data e espaço para assinatura",
    "",
    "=".repeat(60),
    "DADOS DO CASO",
    "=".repeat(60),
    "",
    `AREA DO DIREITO: ${analise.area}`,
    "",
    "PARTE AUTORA (qualificação para a petição):",
    qualificacao(cliente),
    "",
    "ADVOGADO(A) SUBSCRITOR(A):",
    `Nome: ${advogado.nome}`,
    `OAB: ${advogado.oab?.trim() || "[PREENCHER: OAB]"}`,
  );
  if (advogado.escritorio?.trim()) partes.push(`Escritorio: ${advogado.escritorio.trim()}`);
  partes.push(
    "",
    "PARTE RE:",
    "[PREENCHER: qualificação completa da parte contrária]",
    "",
    "RESUMO DO CASO:",
    analise.resumo,
    "",
    bloco("FATOS RELATADOS PELO CLIENTE (ordem cronológica):", analise.fatos, "[PREENCHER: fatos]"),
    "",
    bloco("O QUE O CLIENTE PRETENDE OBTER:", analise.pretensoes, "[PREENCHER: pedidos]"),
    "",
    bloco("DOCUMENTOS DISPONIVEIS:", analise.documentosCitados, "Nenhum documento informado até o momento."),
    "",
    bloco("DOCUMENTOS AINDA NAO OBTIDOS (não afirme que estão anexados):", analise.documentosQueFaltam, "Nenhum."),
    "",
    bloco("TESTEMUNHAS MENCIONADAS:", analise.testemunhas, "Nenhuma."),
    "",
    bloco("PONTOS DE ATENCAO LEVANTADOS NA TRIAGEM:", analise.pontosDeAtencao, "Nenhum."),
    "",
  );
  if (analise.perguntasEmAberto.length > 0) {
    partes.push(bloco("INFORMACOES QUE AINDA FALTAM (trate como lacuna, não preencha):", analise.perguntasEmAberto, ""), "");
  }
  partes.push(
    "VALOR DA CAUSA:",
    analise.valorEnvolvido
      ? `Valor mencionado pelo cliente: ${analise.valorEnvolvido}. Calcule o valor da causa conforme o CPC, art. 292, e explique o critério usado.`
      : "[PREENCHER: valor da causa] — nenhum valor foi mencionado na entrevista. Indique o critério do CPC, art. 292, aplicável ao pedido.",
    "",
  );
  if (observacoesAdvogado.trim()) {
    partes.push("ORIENTACOES ESPECIFICAS DO ADVOGADO RESPONSAVEL:", observacoesAdvogado.trim(), "");
  }
  if (faltando.length > 0) {
    partes.push(
      "ATENCAO — O CADASTRO DO CLIENTE ESTA INCOMPLETO.",
      `Faltam: ${faltando.join(", ")}.`,
      "Mantenha [PREENCHER: ...] nesses pontos e liste-os nas pendências finais.",
      "",
    );
  }
  partes.push(
    "=".repeat(60),
    "Redija agora a petição inicial completa, seguindo a estrutura exigida.",
    "Ao final, sob o título PENDENCIAS ANTES DO PROTOCOLO, liste tudo que ficou marcado como [PREENCHER] " +
      "e tudo que o advogado precisa conferir.",
  );
  return partes.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
