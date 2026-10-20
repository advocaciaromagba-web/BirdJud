// Primeiros passos: o roteiro de configuracao do escritorio que acabou de
// chegar.
//
// TRES REGRAS que decidem tudo aqui:
//
// 1. O passo se marca sozinho. Nenhum "ja fiz" clicado pela pessoa: o roteiro
//    olha o escritorio de verdade (tem senha? tem OAB? o e-mail responde?).
//    Checklist que a pessoa marca mente na primeira vez que ela marca para
//    tirar da frente — e o sistema passa a acreditar numa configuracao que
//    nao existe.
//
// 2. So aparece o que o plano tem. Escritorio sem o modulo de cobrancas nao
//    ve "conecte o Asaas": seria pedir que configurasse o que nao comprou.
//
// 3. Essencial nao se pula. Senha de administracao, dados do escritorio e a
//    equipe sustentam o resto — sem eles a fatura nao sai, a peca sai sem
//    advogado e o financeiro fica trancado. O resto pode ser pulado, com a
//    marca de quem pulou, e retomado quando quiser.
//
// Funcao pura: recebe os fatos, devolve o roteiro. Quem busca os fatos no
// banco e primeiros-passos-do-escritorio.ts.
import type { Modulo } from "./catalogo";

export const FASES = [
  {
    chave: "ESCRITORIO",
    titulo: "O escritório",
    resumo: "Quem é o escritório, quem trabalha nele e quem pode mexer no que é sensível.",
  },
  {
    chave: "CONEXOES",
    titulo: "Ligar o sistema ao mundo",
    resumo: "As contas que fazem o sistema trabalhar sozinho: publicações, avisos, cobrança, assinatura e nuvem.",
  },
  {
    chave: "USO",
    titulo: "Começar a usar",
    resumo: "O primeiro cliente, o primeiro processo e o primeiro compromisso — o sistema passa a ter o que fazer.",
  },
] as const;

export type Fase = (typeof FASES)[number]["chave"];

export type Situacao = "FEITO" | "PENDENTE" | "PULADO" | "INDISPONIVEL";

/** O que se sabe do escritorio. Tudo contado, nada declarado pela pessoa. */
export type Fatos = {
  modulos: Modulo[];
  temSenhaAdmin: boolean;
  cnpj: boolean;
  telefoneAtendimento: boolean;
  logo: boolean;
  advogados: number;
  advogadosComOab: number;
  oabsMonitoradas: number;
  /** tipo da integracao -> status (OK | ERRO | PENDENTE) */
  integracoes: Record<string, string>;
  /** Aplicativo da plataforma registrado na Microsoft ou no Google. */
  nuvemDisponivel: boolean;
  temCadastroFiscal: boolean;
  pessoasComWhatsapp: number;
  modelos: number;
  clientes: number;
  processos: number;
  compromissos: number;
  /** chave do passo -> quando foi pulado */
  pulados: Record<string, string>;
};

export type Passo = {
  chave: string;
  fase: Fase;
  titulo: string;
  /** Por que importa: o que deixa de acontecer sem este passo. */
  porque: string;
  /** O que fazer, em uma ou duas frases. */
  como: string;
  destino: string;
  textoDoBotao: string;
  minutos: number;
  /** Essencial nao se pula. */
  essencial: boolean;
  situacao: Situacao;
  /** O que ja se ve feito, ou o que falta: "1 de 2 advogados com OAB". */
  detalhe: string | null;
};

type Definicao = Omit<Passo, "situacao" | "detalhe"> & {
  /** Sem estes modulos, o passo nem aparece. */
  modulos?: Modulo[];
  feito: (f: Fatos) => boolean;
  detalhe?: (f: Fatos) => string | null;
  /** Aparece, mas nao da para fazer ainda (falta algo da plataforma). */
  indisponivel?: (f: Fatos) => string | null;
};

const ok = (f: Fatos, ...tipos: string[]) => tipos.some((t) => f.integracoes[t] === "OK");
const comErro = (f: Fatos, ...tipos: string[]) => tipos.find((t) => f.integracoes[t] === "ERRO");

const DEFINICOES: Definicao[] = [
  // ------------------------------------------------------------ ESCRITORIO
  {
    chave: "SENHA_ADMIN",
    fase: "ESCRITORIO",
    titulo: "Criar a senha de administração",
    porque:
      "É uma segunda senha, só do administrador, pedida antes de mexer no que é sensível: financeiro, certificado digital e os dados do escritório. Sem ela essas áreas ficam trancadas — inclusive para você.",
    como:
      "Abra Administração e crie a senha. Use uma diferente da senha de entrar no sistema: é ela que protege o escritório se a sua sessão ficar aberta num computador.",
    destino: "/administracao",
    textoDoBotao: "Criar a senha",
    minutos: 1,
    essencial: true,
    feito: (f) => f.temSenhaAdmin,
  },
  {
    chave: "IDENTIDADE",
    fase: "ESCRITORIO",
    titulo: "Dados e identidade do escritório",
    porque:
      "O CNPJ é exigido para emitir a fatura da assinatura. O telefone de atendimento vai em toda mensagem que o cliente recebe — é o número para onde ele liga com dúvida. Logo e cores deixam o sistema e os documentos com a cara do escritório.",
    como:
      "Em Administração, preencha CNPJ, telefone de atendimento e cidade. O logo e as cores são opcionais, mas mudam o sistema inteiro na hora.",
    destino: "/administracao",
    textoDoBotao: "Preencher os dados",
    minutos: 3,
    essencial: true,
    feito: (f) => f.cnpj && f.telefoneAtendimento,
    detalhe: (f) => {
      const falta = [
        f.cnpj ? null : "CNPJ",
        f.telefoneAtendimento ? null : "telefone de atendimento",
      ].filter(Boolean);
      if (falta.length) return `Falta: ${falta.join(" e ")}.`;
      return f.logo ? null : "Pronto. O logo ainda pode ser enviado quando quiser.";
    },
  },
  {
    chave: "EQUIPE",
    fase: "ESCRITORIO",
    titulo: "Cadastrar os advogados, com OAB",
    porque:
      "O advogado com OAB é quem assina as peças geradas, quem fica responsável por prazos e audiências e quem recebe os avisos. Peça gerada sem advogado sai sem assinatura e sem qualificação.",
    como:
      "Em Usuários, inclua cada advogado com e-mail e número da OAB (com a UF). Quem é do apoio entra também, sem OAB. O limite de pessoas depende da faixa contratada.",
    destino: "/usuarios",
    textoDoBotao: "Abrir usuários",
    minutos: 5,
    essencial: true,
    feito: (f) => f.advogadosComOab > 0,
    detalhe: (f) =>
      f.advogados === 0
        ? "Nenhum advogado cadastrado ainda."
        : `${f.advogadosComOab} de ${f.advogados} advogado(s) com OAB.`,
  },

  // ------------------------------------------------------------- CONEXOES
  {
    chave: "OAB_MONITORADA",
    fase: "CONEXOES",
    modulos: ["PUBLICACOES_DJEN"],
    titulo: "Monitorar as OABs no Diário de Justiça",
    porque:
      "E daqui que vem a publicação de cada processo, toda madrugada, já lida pela IA e com o prazo sugerido. Sem OAB cadastrada, o sistema não tem o que buscar — e a intimação só aparece quando alguém lembrar de olhar o tribunal.",
    como:
      "Em Publicações, cadastre o número e a UF de cada OAB do escritório. A primeira captura acontece na madrugada seguinte.",
    destino: "/publicacoes",
    textoDoBotao: "Cadastrar OABs",
    minutos: 2,
    essencial: false,
    feito: (f) => f.oabsMonitoradas > 0,
    detalhe: (f) => (f.oabsMonitoradas ? `${f.oabsMonitoradas} OAB(s) monitorada(s).` : null),
  },
  {
    chave: "EMAIL",
    fase: "CONEXOES",
    modulos: ["EMAIL"],
    titulo: "Conectar o e-mail do escritório",
    porque:
      "Lembrete de audiência, resumo do dia, recibo e aviso de compromisso saem pelo e-mail do próprio escritório. Sem ele, os avisos ficam parados na fila — gerados, mas sem sair.",
    como:
      "Em Integrações, informe o servidor de envio (SMTP) do e-mail do escritório. O sistema manda uma mensagem de teste antes de guardar.",
    destino: "/integracoes",
    textoDoBotao: "Conectar o e-mail",
    minutos: 4,
    essencial: false,
    feito: (f) => ok(f, "SMTP"),
    detalhe: (f) => (comErro(f, "SMTP") ? "Conectado, mas o último teste falhou." : null),
  },
  {
    chave: "WHATSAPP",
    fase: "CONEXOES",
    modulos: ["WHATSAPP"],
    titulo: "Quem recebe avisos pelo WhatsApp",
    porque:
      "O número do WhatsApp é da plataforma, não precisa ligar nada. Mas o sistema só avisa pelo WhatsApp quem tem celular cadastrado e marcou que quer receber — sem isso, a audiência de amanhã não chega no bolso de ninguém do escritório.",
    como:
      "Cada pessoa, em Minha conta, informa o celular e marca \"receber pelo WhatsApp\". Para o cliente, basta o celular no cadastro dele.",
    destino: "/conta",
    textoDoBotao: "Abrir minha conta",
    minutos: 1,
    essencial: false,
    feito: (f) => f.pessoasComWhatsapp > 0,
    detalhe: (f) =>
      f.pessoasComWhatsapp ? `${f.pessoasComWhatsapp} pessoa(s) recebendo pelo WhatsApp.` : null,
  },
  {
    chave: "COBRANCA",
    fase: "CONEXOES",
    modulos: ["COBRANCAS"],
    titulo: "Conectar a conta de cobrança",
    porque:
      "Boleto e Pix de honorários saem pela conta do escritório no Asaas (ou InfinitePay), e o pagamento dá baixa sozinho. Sem a conta, honorário continua sendo cobrado a mão e conferido no extrato.",
    como:
      "Em Integrações, cole a chave de API da conta Asaas do escritório. O sistema confere a chave antes de guardar.",
    destino: "/integracoes",
    textoDoBotao: "Conectar a cobrança",
    minutos: 4,
    essencial: false,
    feito: (f) => ok(f, "ASAAS", "INFINITEPAY"),
    detalhe: (f) => (comErro(f, "ASAAS", "INFINITEPAY") ? "Conectada, mas o último teste falhou." : null),
  },
  {
    chave: "ASSINATURA",
    fase: "CONEXOES",
    modulos: ["ASSINATURA"],
    titulo: "Conectar a assinatura eletrônica",
    porque:
      "Contrato, procuração e declaração saem do sistema direto para o cliente assinar pelo celular, e a via assinada volta sozinha. Sem a conta, é imprimir, assinar, escanear e anexar.",
    como: "Em Integrações, cole o token da conta Autentique do escritório.",
    destino: "/integracoes",
    textoDoBotao: "Conectar a assinatura",
    minutos: 3,
    essencial: false,
    feito: (f) => ok(f, "AUTENTIQUE"),
    detalhe: (f) => (comErro(f, "AUTENTIQUE") ? "Conectada, mas o último teste falhou." : null),
  },
  {
    chave: "NUVEM",
    fase: "CONEXOES",
    modulos: ["NUVEM"],
    titulo: "Conectar o OneDrive ou o Google Drive",
    porque:
      "O sistema cria uma pasta para cada cliente na nuvem do escritório e copia para lá todo documento anexado. O escritório passa a achar tudo no lugar de sempre, sem baixar e reorganizar.",
    como:
      "Em Integrações, clique em \"Entrar com a conta Microsoft\" ou \"Entrar com a conta Google\" e autorize. As pastas são criadas sozinhas.",
    destino: "/integracoes",
    textoDoBotao: "Conectar a nuvem",
    minutos: 2,
    essencial: false,
    feito: (f) => ok(f, "MICROSOFT", "GOOGLE"),
    indisponivel: (f) =>
      f.nuvemDisponivel ? null : "A plataforma ainda está liberando a conexão com a Microsoft e o Google.",
  },
  {
    chave: "NOTA_FISCAL",
    fase: "CONEXOES",
    modulos: ["NFSE"],
    titulo: "Preparar a nota fiscal",
    porque:
      "A nota de serviço sai assinada com o certificado digital A1 do escritório, com os dados fiscais da prefeitura. Sem os dois, não sai nota — e honorário recebido fica sem documento fiscal.",
    como:
      "Em Administração, envie o certificado A1 (arquivo .pfx e senha). Em Notas fiscais, preencha inscrição municipal e o código de serviço.",
    destino: "/notas",
    textoDoBotao: "Preparar a nota",
    minutos: 6,
    essencial: false,
    feito: (f) => ok(f, "NFSE_CERT") && f.temCadastroFiscal,
    detalhe: (f) => {
      const falta = [
        ok(f, "NFSE_CERT") ? null : "certificado A1",
        f.temCadastroFiscal ? null : "cadastro fiscal",
      ].filter(Boolean);
      return falta.length && falta.length < 2 ? `Falta: ${falta.join(" e ")}.` : null;
    },
  },
  {
    chave: "MODELOS",
    fase: "CONEXOES",
    titulo: "Enviar os modelos do escritório",
    porque:
      "Contrato de honorários, procuração e declaração saem no papel timbrado do próprio escritório, já preenchidos com os dados do cliente. Sem modelo, o sistema usa o padrão dele, sem o timbre.",
    como:
      "Em Modelos, envie o .docx de cada documento que o escritório já usa. As marcações de onde entra cada dado estão explicadas na própria tela.",
    destino: "/modelos",
    textoDoBotao: "Enviar modelos",
    minutos: 10,
    essencial: false,
    feito: (f) => f.modelos > 0,
    detalhe: (f) => (f.modelos ? `${f.modelos} modelo(s) enviado(s).` : null),
  },

  // ------------------------------------------------------------------ USO
  {
    chave: "PRIMEIRO_CLIENTE",
    fase: "USO",
    titulo: "Cadastrar os primeiros clientes",
    porque:
      "Cliente é o centro de tudo: processo, compromisso, documento, cobrança e pasta na nuvem se penduram nele. Comece pelos que tem algo acontecendo agora.",
    como:
      "Em Clientes, cadastre nome, CPF ou CNPJ e celular — dá para preencher lendo a foto do documento, com a IA. Vindo de outro sistema? Em Clientes > Importar planilha, traga todos de uma vez pelo Excel.",
    destino: "/clientes",
    textoDoBotao: "Cadastrar cliente",
    minutos: 3,
    essencial: false,
    feito: (f) => f.clientes > 0,
    detalhe: (f) => (f.clientes ? `${f.clientes} cliente(s).` : null),
  },
  {
    chave: "PRIMEIRO_PROCESSO",
    fase: "USO",
    titulo: "Cadastrar os processos em andamento",
    porque:
      "Com o processo cadastrado, a publicação capturada se liga a ele sozinha, o prazo nasce no processo certo e o cliente certo é avisado.",
    como: "Em Processos, informe o número CNJ e o cliente. Vara e comarca podem vir da leitura da peça.",
    destino: "/processos",
    textoDoBotao: "Cadastrar processo",
    minutos: 3,
    essencial: false,
    feito: (f) => f.processos > 0,
    detalhe: (f) => (f.processos ? `${f.processos} processo(s).` : null),
  },
  {
    chave: "PRIMEIRO_COMPROMISSO",
    fase: "USO",
    titulo: "Lançar a próxima audiência ou reunião",
    porque:
      "É o primeiro aviso de verdade: o cliente recebe a confirmação na hora e os lembretes 3 dias, 1 dia e 1 hora antes, sem ninguém do escritório lembrar de mandar.",
    como:
      "Em Agenda, clique em Novo compromisso — ou em Agendar lendo documento, e envie a intimação. Depois, em Ver, inclua quem vai.",
    destino: "/agenda",
    textoDoBotao: "Abrir a agenda",
    minutos: 2,
    essencial: false,
    feito: (f) => f.compromissos > 0,
  },
];

export type Roteiro = {
  passos: Passo[];
  /** So os que contam: feitos + pendentes (pulado e indisponivel nao). */
  total: number;
  feitos: number;
  /** 0 a 100. */
  porcento: number;
  /** Os essenciais estao todos feitos. */
  essenciaisFeitos: boolean;
  /** Nada pendente: tudo feito, pulado ou indisponivel. */
  completo: boolean;
  /** O proximo a fazer, na ordem do roteiro. */
  proximo: Passo | null;
  minutosRestantes: number;
};

export function montarRoteiro(f: Fatos): Roteiro {
  const passos: Passo[] = [];
  for (const d of DEFINICOES) {
    if (d.modulos && !d.modulos.every((m) => f.modulos.includes(m))) continue;

    const feito = d.feito(f);
    const motivoIndisponivel = !feito && d.indisponivel ? d.indisponivel(f) : null;
    const situacao: Situacao = feito
      ? "FEITO"
      : motivoIndisponivel
        ? "INDISPONIVEL"
        : !d.essencial && f.pulados[d.chave]
          ? "PULADO"
          : "PENDENTE";

    passos.push({
      chave: d.chave,
      fase: d.fase,
      titulo: d.titulo,
      porque: d.porque,
      como: d.como,
      destino: d.destino,
      textoDoBotao: d.textoDoBotao,
      minutos: d.minutos,
      essencial: d.essencial,
      situacao,
      detalhe: motivoIndisponivel ?? d.detalhe?.(f) ?? null,
    });
  }

  const contam = passos.filter((p) => p.situacao === "FEITO" || p.situacao === "PENDENTE");
  const feitos = contam.filter((p) => p.situacao === "FEITO").length;
  const pendentes = passos.filter((p) => p.situacao === "PENDENTE");

  return {
    passos,
    total: contam.length,
    feitos,
    porcento: contam.length ? Math.round((feitos / contam.length) * 100) : 100,
    essenciaisFeitos: passos.filter((p) => p.essencial).every((p) => p.situacao === "FEITO"),
    completo: pendentes.length === 0,
    proximo: pendentes[0] ?? null,
    minutosRestantes: pendentes.reduce((soma, p) => soma + p.minutos, 0),
  };
}

/** Pode pular? So o que nao e essencial, e so o que ainda esta pendente. */
export function podePular(chave: string): boolean {
  const d = DEFINICOES.find((x) => x.chave === chave);
  return Boolean(d && !d.essencial);
}

export const CHAVES_DOS_PASSOS = DEFINICOES.map((d) => d.chave);
