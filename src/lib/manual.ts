// Conteudo do manual de utilizacao (/manual). So texto e dados: a pagina e o
// componente interativo montam a tela a partir daqui.
//
// Regra: tudo o que esta escrito aqui existe no sistema hoje, com os nomes dos
// botoes como aparecem na tela. As imagens sao capturas reais do escritorio de
// demonstracao, com dados inventados (public/manual/).

/** Largura e altura de cada captura, para a pagina reservar o espaco. */
export const TAMANHO_DA_TELA: Record<string, [number, number]> = {
  "agenda": [1366, 860],
  "arquivos": [1366, 860],
  "busca": [1366, 860],
  "celular-agenda": [780, 1688],
  "celular-inicio": [780, 1688],
  "celular-menu": [780, 1688],
  "cliente-ficha": [1366, 860],
  "cliente-ficha-inteira": [1366, 3072],
  "cliente-novo": [1366, 860],
  "clientes": [1366, 860],
  "cobrancas": [1366, 860],
  "cobrancas-a-pagar": [1366, 860],
  "configuracoes": [1366, 860],
  "conta": [1366, 860],
  "despesas": [1366, 860],
  "entrar": [1366, 860],
  "entrevistas": [1366, 860],
  "equipe": [1366, 860],
  "financeiro": [1366, 860],
  "financeiro-fixas": [1366, 860],
  "financeiro-lancamentos": [1366, 860],
  "financeiro-tranca": [1366, 860],
  "inicio": [1366, 860],
  "integracoes": [1366, 860],
  "modelos": [1366, 860],
  "notas": [1366, 860],
  "primeiros-passos": [1366, 860],
  "processo-ficha": [1366, 860],
  "processos": [1366, 860],
  "publicacoes": [1366, 860],
  "relatorios": [1366, 860],
  "tarefa-nova": [1366, 860],
  "tarefas": [1366, 860],
};

export type Papel = "ADMIN" | "ADVOGADO" | "APOIO";

export type Tela = { arquivo: string; legenda: string; celular?: boolean };

export type PassoAPasso = { titulo: string; etapas: string[] };

export type Secao = {
  id: string;
  grupo: string;
  titulo: string;
  resumo: string;
  /** Onde fica no menu. */
  caminho: string;
  /** Quem usa no dia a dia. */
  papeis: Papel[];
  /** Plano ou modulo, quando nao e de todos. */
  modulo?: string;
  telas: Tela[];
  passos: PassoAPasso[];
  dicas?: string[];
};

export const ROTULO_DO_PAPEL: Record<Papel, string> = {
  ADMIN: "Administrador",
  ADVOGADO: "Advogado",
  APOIO: "Apoio (secretaria, estagiário)",
};

/** Os pontos numerados sobre a tela inicial. x e y em % da imagem. */
export const PONTOS_DA_TELA_INICIAL = [
  { n: 1, x: 9, y: 45, titulo: "Menu", texto: "Cada área do sistema. Só aparece o que o plano contratou e o que o administrador liberou para você." },
  { n: 2, x: 34, y: 4, titulo: "Busca", texto: "Digite parte do nome do cliente, o número do processo ou um trecho da publicação. Os resultados aparecem enquanto você digita." },
  { n: 3, x: 62, y: 26, titulo: "Números do escritório", texto: "Clientes, processos ativos, compromissos e publicações não lidas. Clique em qualquer um para abrir a lista." },
  { n: 4, x: 62, y: 49, titulo: "Precisa de você", texto: "O que está travando o escritório: tarefa vencendo, cobrança atrasada, configuração que falta. Cada aviso some sozinho quando o problema é resolvido." },
  { n: 5, x: 40, y: 82, titulo: "Agenda das próximas 48 horas", texto: "Audiências, perícias, atendimentos e prazos que estão chegando." },
  { n: 6, x: 79, y: 82, titulo: "Publicações não lidas", texto: "O que saiu no Diário de Justiça para as OABs do escritório, com as urgentes em cima." },
  { n: 7, x: 9, y: 70, titulo: "Primeiros passos, manual e configurações", texto: "O roteiro de implantação, este manual de uso, as suas preferências e, para o administrador, as integrações e a configuração do escritório." },
  { n: 8, x: 9, y: 94, titulo: "Quem está logado", texto: "Seu nome e papel. O botão Sair encerra a sessão — use sempre em computador compartilhado." },
];

export const CHECKLIST_DE_IMPLANTACAO = [
  { id: "senha-adm", texto: "Criar a senha de administração", onde: "Configurações", essencial: true },
  { id: "dados", texto: "Preencher CNPJ, telefone de atendimento, cidade, logo e cores", onde: "Configurações", essencial: true },
  { id: "equipe", texto: "Cadastrar os advogados (com OAB) e a equipe de apoio", onde: "Equipe", essencial: true },
  { id: "oab", texto: "Monitorar as OABs no Diário de Justiça", onde: "Publicações" },
  { id: "email", texto: "Conectar o e-mail do escritório", onde: "Integrações" },
  { id: "whats", texto: "Informar quem recebe avisos pelo WhatsApp", onde: "Minha conta" },
  { id: "asaas", texto: "Conectar a conta de cobrança (Asaas ou InfinitePay)", onde: "Integrações" },
  { id: "assinatura", texto: "Conectar a assinatura eletrônica (Autentique)", onde: "Integrações" },
  { id: "nota", texto: "Preparar a nota fiscal: cadastro fiscal e certificado e-CNPJ", onde: "Notas fiscais e Integrações" },
  { id: "modelos", texto: "Enviar os modelos de procuração e contrato do escritório", onde: "Modelos" },
  { id: "clientes", texto: "Cadastrar (ou importar) os primeiros clientes", onde: "Clientes" },
  { id: "processos", texto: "Cadastrar os processos", onde: "Processos" },
  { id: "agenda", texto: "Lançar os próximos compromissos", onde: "Agenda" },
];

export const SECOES: Secao[] = [
  {
    id: "entrar",
    grupo: "Comece por aqui",
    titulo: "Entrar no sistema",
    resumo:
      "Cada escritório tem o próprio endereço, com a sua marca: seu-escritorio.birdjud.com.br. Funciona no computador e no celular, direto no navegador, sem instalar nada.",
    caminho: "seu-escritorio.birdjud.com.br",
    papeis: ["ADMIN", "ADVOGADO", "APOIO"],
    telas: [{ arquivo: "entrar", legenda: "A tela de entrada, com a marca do escritório" }],
    passos: [
      {
        titulo: "Primeiro acesso",
        etapas: [
          "Abra o endereço do seu escritório (quem administra recebe na contratação; a equipe recebe do administrador).",
          "Digite o e-mail e a senha provisória que o administrador cadastrou para você.",
          "Leia e aceite os termos de uso, só na primeira vez.",
          "Em Minha conta, troque a senha provisória por uma sua, com pelo menos 10 caracteres.",
        ],
      },
      {
        titulo: "Esqueci a senha",
        etapas: [
          "Na tela de entrada, clique em “Esqueci minha senha”.",
          "Informe o seu e-mail: chega um link para criar uma senha nova.",
          "Sem e-mail configurado no escritório, peça ao administrador uma senha provisória em Equipe.",
        ],
      },
    ],
    dicas: [
      "Ative o segundo fator em Minha conta: além da senha, o login pede um código do aplicativo autenticador do celular.",
      "Depois de várias tentativas erradas a conta fica bloqueada por alguns minutos — é proteção, não defeito.",
    ],
  },
  {
    id: "inicio",
    grupo: "Comece por aqui",
    titulo: "A tela inicial (Hoje)",
    resumo:
      "Ao entrar, o sistema mostra o que pede atenção agora. A ideia é abrir o dia por aqui: o que vence, o que chegou e o que está parado.",
    caminho: "Menu › Início",
    papeis: ["ADMIN", "ADVOGADO", "APOIO"],
    telas: [{ arquivo: "inicio", legenda: "Clique nos números para conhecer cada parte da tela" }],
    passos: [
      {
        titulo: "O que olhar todo dia",
        etapas: [
          "“Precisa de você”: resolva de cima para baixo. Cada aviso some quando o problema é resolvido.",
          "Agenda das próximas 48 horas: confira audiências e prazos que estão chegando.",
          "Publicações não lidas: abra as urgentes primeiro.",
          "Administrador: veja também o recebido no mês e as contas a pagar vencendo (os valores só aparecem com o Financeiro destrancado).",
        ],
      },
    ],
  },
  {
    id: "busca",
    grupo: "Comece por aqui",
    titulo: "Busca",
    resumo: "A barra no topo de todas as telas procura cliente, processo e publicação ao mesmo tempo.",
    caminho: "Topo de qualquer tela",
    papeis: ["ADMIN", "ADVOGADO", "APOIO"],
    telas: [{ arquivo: "busca", legenda: "Resultados aparecem enquanto você digita" }],
    passos: [
      {
        titulo: "Achar qualquer coisa",
        etapas: [
          "Clique na barra “Buscar cliente, processo, publicação…”.",
          "Digite parte do nome, do CPF/CNPJ ou do número do processo (com ou sem pontos).",
          "Clique no resultado para abrir a ficha.",
        ],
      },
    ],
  },
  {
    id: "primeiros-passos",
    grupo: "Comece por aqui",
    titulo: "Primeiros passos (implantação)",
    resumo:
      "Um roteiro que leva o escritório do zero ao funcionamento completo. Cada passo se marca sozinho quando é feito de verdade — o sistema confere.",
    caminho: "Menu › Primeiros passos",
    papeis: ["ADMIN"],
    telas: [{ arquivo: "primeiros-passos", legenda: "O roteiro mostra o que falta, por que importa e o atalho para fazer" }],
    passos: [
      {
        titulo: "Implantar o escritório",
        etapas: [
          "Comece pelos três passos essenciais: senha de administração, dados do escritório e cadastro da equipe.",
          "Depois ligue o sistema ao mundo: OABs, e-mail, WhatsApp, cobrança, assinatura, nota fiscal e modelos.",
          "Por fim, cadastre os primeiros clientes, processos e compromissos.",
          "Não precisa ser tudo no mesmo dia: o roteiro guarda onde você parou.",
        ],
      },
    ],
    dicas: ["Use a lista de conferência no fim deste manual para acompanhar a implantação com a equipe."],
  },
  {
    id: "agenda",
    grupo: "Dia a dia",
    titulo: "Agenda",
    resumo:
      "Audiências, perícias e atendimentos do escritório, com responsável, sala virtual e aviso automático para quem precisa comparecer.",
    caminho: "Menu › Agenda",
    papeis: ["ADMIN", "ADVOGADO", "APOIO"],
    telas: [
      { arquivo: "agenda", legenda: "A agenda do escritório, com as ações de cada compromisso" },
      { arquivo: "celular-agenda", legenda: "A mesma agenda no celular", celular: true },
    ],
    passos: [
      {
        titulo: "Marcar um compromisso",
        etapas: [
          "Clique em “Novo compromisso”.",
          "Escolha o tipo (audiência, perícia, atendimento/reunião), a data e a hora.",
          "Informe o responsável, o processo ou o cliente, o local e, se for virtual, o link da sala (Teams, Zoom, Webex ou Meet).",
          "Inclua os participantes (cliente, testemunha, preposto): eles recebem a confirmação e os lembretes.",
          "Salve. Quem ficou responsável é avisado.",
        ],
      },
      {
        titulo: "Agendar a partir de um documento",
        etapas: [
          "Clique em “Agendar lendo documento” e envie a intimação, o mandado ou o print do despacho.",
          "A inteligência artificial lê a data, a hora e o tipo; confira cada campo marcado.",
          "Ajuste o que for preciso e salve.",
        ],
      },
      {
        titulo: "Editar, avisar ou excluir",
        etapas: [
          "Em cada linha: “Ver”, “Editar”, “Avisar” (manda o aviso de novo aos participantes) e “Excluir”.",
          "Mudou a data? Os lembretes antigos são cancelados e os novos saem com a hora certa.",
          "O que foi excluído fica registrado em “Excluídos (auditoria)”; o que foi enviado, em “Notificações enviadas”.",
        ],
      },
    ],
    dicas: [
      "Lembrete automático 24 horas antes, por e-mail e WhatsApp (conforme o plano).",
      "Com o sistema aberto no navegador, toca um alerta 1 hora e 15 minutos antes do compromisso de que você é responsável.",
      "Audiência ou perícia com responsável que não é advogado gera um aviso na tela, para ninguém ir sozinho por engano.",
      "Usa também o NetLead? Em Minha conta, seus horários ocupados ficam bloqueados lá.",
    ],
  },
  {
    id: "tarefas",
    grupo: "Dia a dia",
    titulo: "Tarefas e metas",
    resumo:
      "Peças, manifestações, recursos e providências com responsável, entrega no escritório e prazo fatal. Audiência e atendimento ficam na Agenda.",
    caminho: "Menu › Tarefas",
    papeis: ["ADMIN", "ADVOGADO", "APOIO"],
    telas: [
      { arquivo: "tarefas", legenda: "As tarefas da equipe, com prioridade e prazo" },
      { arquivo: "tarefa-nova", legenda: "Nova tarefa: preenchida à mão ou a partir de um documento" },
    ],
    passos: [
      {
        titulo: "Criar uma tarefa",
        etapas: [
          "Clique em “Nova tarefa”.",
          "Escreva o serviço no título (ex.: contestação, manifestação sobre o laudo).",
          "Informe a entrega no escritório, o prazo fatal do processo (se houver), a prioridade e o responsável.",
          "Ligue ao cliente e ao número do processo, e anexe os arquivos que ajudam.",
          "Salve. O responsável é avisado.",
        ],
      },
      {
        titulo: "Criar a partir da intimação",
        etapas: [
          "Em “Preencher a partir de um documento”, envie a intimação, o despacho ou a sentença e clique em “Ler documentos”.",
          "A IA lê o que fazer e o prazo; o sistema calcula o prazo fatal (dias úteis e feriados) e sugere a entrega antes dele.",
          "Se o documento manda fazer mais de uma coisa, as outras providências ficam prontas para criar em seguida.",
        ],
      },
      {
        titulo: "Concluir e registrar o que foi feito",
        etapas: [
          "Marque a tarefa como concluída quando terminar.",
          "Registre a solução (ex.: “Protocolada a manifestação em 29/10”): fica no histórico do processo.",
          "Errou o clique? Dá para reabrir.",
        ],
      },
    ],
    dicas: [
      "Os avisos de tarefa saem em duas entregas por dia, às 12h e às 18h, para o celular de ninguém apitar o dia inteiro. Urgente com entrega no mesmo dia sai na hora.",
      "Marque “É uma meta” para os objetivos da equipe, que ficam ao lado das tarefas.",
    ],
  },
  {
    id: "processos",
    grupo: "Dia a dia",
    titulo: "Processos",
    resumo:
      "Cada processo numa ficha: cliente, tribunal, vara, publicações, tarefas, compromissos e o que está a receber daquele caso.",
    caminho: "Menu › Processos",
    papeis: ["ADMIN", "ADVOGADO", "APOIO"],
    telas: [
      { arquivo: "processos", legenda: "A lista de processos do escritório" },
      { arquivo: "processo-ficha", legenda: "A ficha de um processo" },
    ],
    passos: [
      {
        titulo: "Cadastrar um processo",
        etapas: [
          "Clique em “Novo processo” e informe o número (o sistema confere o padrão do CNJ).",
          "Escolha o cliente, o tribunal, a vara e a área.",
          "Salve. As publicações novas daquele número passam a cair na ficha sozinhas.",
        ],
      },
      {
        titulo: "Trazer os processos da OAB",
        etapas: [
          "Com as OABs monitoradas, o sistema busca no Diário de Justiça Eletrônico Nacional os processos dos últimos 12 meses.",
          "Eles entram cadastrados e, quando as partes batem com o cadastro, já ligados ao cliente.",
        ],
      },
    ],
  },
  {
    id: "publicacoes",
    grupo: "Dia a dia",
    titulo: "Publicações",
    resumo:
      "O que sai no Diário de Justiça (DJEN) para as OABs do escritório chega aqui todos os dias, com o prazo calculado e uma sugestão do que fazer.",
    caminho: "Menu › Publicações",
    papeis: ["ADMIN", "ADVOGADO"],
    modulo: "Profissional, Avançado e Completo · resumo por IA no Completo",
    telas: [{ arquivo: "publicacoes", legenda: "Publicação com a sugestão da IA e o prazo calculado" }],
    passos: [
      {
        titulo: "Monitorar as OABs",
        etapas: [
          "Abra “OABs monitoradas” e inclua o número e a UF de cada advogado do escritório.",
          "A partir daí a captura é diária e automática.",
        ],
      },
      {
        titulo: "Tratar uma publicação",
        etapas: [
          "Clique na publicação para ler o texto inteiro. As urgentes ficam em cima.",
          "Veja a sugestão da IA (tarefa ou compromisso na agenda) e o prazo fatal, com a conta explicada (CPC 219 e 224).",
          "Confira o título, a entrega e o responsável, e clique em “Conferi — criar tarefa”.",
          "Se a sugestão não serve, clique em “não é nada disso”; para só tirar da fila, “Marcar como lida” ou “Arquivar”.",
        ],
      },
    ],
    dicas: [
      "A sugestão da IA é sempre conferida por uma pessoa antes de virar tarefa: o sistema nunca cria prazo sozinho.",
      "Processo ou cliente que ainda não existe pode ser cadastrado direto a partir da publicação.",
    ],
  },
  {
    id: "clientes",
    grupo: "Clientes e documentos",
    titulo: "Clientes",
    resumo:
      "O cadastro completo de cada cliente: dados, contatos, representantes, processos, documentos, honorários e cobranças, numa ficha só.",
    caminho: "Menu › Clientes",
    papeis: ["ADMIN", "ADVOGADO", "APOIO"],
    telas: [
      { arquivo: "clientes", legenda: "A lista de clientes, com o que falta em cada cadastro" },
      { arquivo: "cliente-novo", legenda: "Novo cliente: só o nome é obrigatório" },
      { arquivo: "cliente-ficha", legenda: "A ficha do cliente" },
    ],
    passos: [
      {
        titulo: "Cadastrar um cliente",
        etapas: [
          "Clique em “Novo cliente”. Só o nome é obrigatório; o resto pode entrar depois.",
          "Com o plano Completo, envie o RG, a CNH ou o comprovante de endereço: a IA lê e preenche os campos. O que ela leu com dúvida chega marcado “confira”.",
          "Comece o endereço pelo CEP: rua, bairro e cidade vêm sozinhos.",
          "Salve. CPF e CNPJ são conferidos pelo dígito verificador.",
        ],
      },
      {
        titulo: "Importar a base que você já tem",
        etapas: [
          "Clique em “Importar planilha” e envie o arquivo (Excel ou CSV).",
          "Diga qual coluna é o nome, o CPF, o telefone…",
          "Confira a prévia: o sistema aponta duplicados e documentos inválidos antes de gravar.",
        ],
      },
      {
        titulo: "Empresa, menor de idade e representantes",
        etapas: [
          "Empresa: em “Quem assina pela empresa”, cadastre o sócio ou os sócios que assinam. É por eles que a assinatura eletrônica chega.",
          "Menor de idade: abra a ficha da mãe, do pai ou do responsável e cadastre o menor a partir dela. A peça sai com “representado(a) por” no gênero certo.",
        ],
      },
    ],
    dicas: [
      "“Pendências do cadastro” diz o que falta e o que aquilo atrapalha (ex.: sem e-mail, o link de pagamento não chega).",
      "Em “Envio automático” você desliga o WhatsApp ou o e-mail de um cliente sem apagar o contato.",
    ],
  },
  {
    id: "documentos",
    grupo: "Clientes e documentos",
    titulo: "Documentos e assinatura eletrônica",
    resumo:
      "Procuração, contrato de honorários, declaração de hipossuficiência e recibo saem prontos a partir do cadastro, e podem ir para assinatura eletrônica sem imprimir.",
    caminho: "Clientes › ficha do cliente",
    papeis: ["ADMIN", "ADVOGADO", "APOIO"],
    modulo: "Documentos em todos os planos · assinatura eletrônica no Completo",
    telas: [{ arquivo: "cliente-ficha-inteira", legenda: "A ficha inteira: cadastro, representantes, documentos, honorários e cobranças" }],
    passos: [
      {
        titulo: "Gerar um documento",
        etapas: [
          "Na ficha do cliente, vá até a geração de documentos.",
          "Escolha o documento. O que falta no cadastro aparece marcado antes de gerar.",
          "Baixe em Word (.docx) para revisar, ou envie direto para assinatura.",
        ],
      },
      {
        titulo: "Mandar para assinatura",
        etapas: [
          "Com a Autentique conectada em Integrações, clique em enviar para assinatura.",
          "O cliente (ou quem o representa) recebe o link por e-mail e WhatsApp e assina pelo celular.",
          "O sistema confere sozinho quem já assinou e lembra quem falta; dá para reenviar.",
          "O documento assinado volta para a pasta do cliente.",
        ],
      },
      {
        titulo: "Pedir documentos ao cliente",
        etapas: [
          "Em “Documentos a pedir”, monte a lista do que precisa (RG, comprovante, contrato…).",
          "Envie: o cliente recebe um link para mandar os arquivos pelo celular, que caem na ficha.",
        ],
      },
    ],
    dicas: ["Os textos saem dos modelos do escritório (ver Modelos). Procuração sai uma por ação, com o objeto de cada uma."],
  },
  {
    id: "entrevistas",
    grupo: "Clientes e documentos",
    titulo: "Entrevistas",
    resumo:
      "A primeira conversa com quem procura o escritório vira documento: roteiro de perguntas, anotações, gravação e um resumo organizado em fatos, documentos e pontos a verificar.",
    caminho: "Menu › Entrevistas",
    papeis: ["ADMIN", "ADVOGADO", "APOIO"],
    modulo: "Anotação em todos os planos · roteiro, transcrição e organização com IA no Completo",
    telas: [{ arquivo: "entrevistas", legenda: "Entrevistas do escritório" }],
    passos: [
      {
        titulo: "Fazer uma entrevista",
        etapas: [
          "Clique em “Nova entrevista” antes da conversa. Pode ser com quem ainda não é cliente.",
          "O sistema sugere o roteiro de perguntas para o assunto.",
          "Anote durante a conversa ou grave o áudio (o navegador pede permissão para o microfone).",
          "No fim, organize: o sistema separa fatos, documentos a pedir e pontos a verificar.",
          "Gere o PDF da entrevista: ele fica guardado na pasta do cliente.",
        ],
      },
    ],
    dicas: ["Dá para mandar perguntas ao cliente pelo WhatsApp e receber as respostas em áudio."],
  },
  {
    id: "cobrancas",
    grupo: "Dinheiro",
    titulo: "Cobranças",
    resumo:
      "Boleto, Pix e cartão emitidos na conta Asaas (ou InfinitePay) do próprio escritório, com baixa automática quando o cliente paga.",
    caminho: "Menu › Cobranças",
    papeis: ["ADMIN", "APOIO"],
    modulo: "Avançado e Completo",
    telas: [
      { arquivo: "cobrancas", legenda: "A receber: em aberto, vencido e recebido, agrupado por cliente" },
      { arquivo: "cobrancas-a-pagar", legenda: "A pagar: as contas do escritório, com a leitura de várias contas de uma vez" },
    ],
    passos: [
      {
        titulo: "Emitir uma cobrança",
        etapas: [
          "Conecte a conta Asaas em Integrações (só uma vez).",
          "Clique em “Nova cobrança”, escolha o cliente, o valor, o vencimento e a forma (boleto, Pix ou cartão).",
          "Para parcelar, escolha o número de parcelas (a cada 30 dias). Para cobrar todo mês, use o quadro de mensalidades, logo abaixo.",
          "Emita. O cliente recebe o link de pagamento por e-mail e WhatsApp.",
        ],
      },
      {
        titulo: "Dar baixa à mão",
        etapas: [
          "Recebeu em dinheiro ou transferência? Clique em “dar baixa” na cobrança.",
          "Informe o valor (pode ser parcial), a data, a forma de pagamento e quem recebeu.",
          "Quitada por aqui, o Asaas também é avisado. Errou? “Desfazer” devolve como estava.",
        ],
      },
      {
        titulo: "Reemitir, cancelar e conferir",
        etapas: [
          "“reemitir boleto” gera vencimento (e valor) novos sem avisar o cliente de novo.",
          "“cancelar” cancela também no Asaas.",
          "“Conferir no Asaas” mostra o que existe lá e não aqui (criado direto no painel deles), o que não bate e os pagadores sem cadastro. Você escolhe o que trazer.",
        ],
      },
    ],
    dicas: [
      "Filtros rápidos: A receber, Vencidas, Pagas em parte, Pagas e Todas.",
      "O administrador pode liberar separadamente emitir, dar baixa e desfazer para cada pessoa da equipe.",
      "A aba “A pagar” só abre com o Financeiro destrancado.",
    ],
  },
  {
    id: "notas",
    grupo: "Dinheiro",
    titulo: "Notas fiscais",
    resumo:
      "NFS-e pelo Sistema Nacional, assinada com o certificado e-CNPJ do escritório. A equipe prepara; o titular do certificado assina e emite.",
    caminho: "Menu › Notas fiscais",
    papeis: ["ADMIN", "APOIO"],
    modulo: "Avançado e Completo",
    telas: [{ arquivo: "notas", legenda: "Configuração do emissor e notas do escritório" }],
    passos: [
      {
        titulo: "Preparar o emissor (uma vez)",
        etapas: [
          "Em “Configurar emissor”, envie o cartão CNPJ: a IA preenche razão social, CNPJ, endereço e código do serviço.",
          "Confirme com o contador o regime tributário, o código do serviço e as alíquotas.",
          "Envie o certificado e-CNPJ A1 em Integrações. Quem envia vira o titular.",
        ],
      },
      {
        titulo: "Emitir uma nota",
        etapas: [
          "Clique em preparar nota, escolha o cliente (tomador), o valor e a descrição do serviço.",
          "O titular abre a nota, confere e assina digitando a senha do certificado (ela nunca fica guardada).",
          "Aceita pela prefeitura, a chave de acesso e o PDF ficam guardados e podem ir ao cliente.",
          "Recusada? O sistema diz o motivo em português.",
        ],
      },
    ],
  },
  {
    id: "financeiro",
    grupo: "Dinheiro",
    titulo: "Financeiro",
    resumo:
      "O caixa do escritório: lançamentos, previsão de arrecadação, despesas, fechamento do mês e metas. Protegido por uma segunda senha.",
    caminho: "Menu › Financeiro",
    papeis: ["ADMIN"],
    modulo: "Avançado e Completo",
    telas: [
      { arquivo: "financeiro-tranca", legenda: "A segunda senha: vale por 30 minutos" },
      { arquivo: "financeiro", legenda: "Panorama: o mês e a previsão de arrecadação" },
      { arquivo: "financeiro-lancamentos", legenda: "Lançamentos do mês" },
      { arquivo: "financeiro-fixas", legenda: "Despesas fixas, geradas todo mês" },
    ],
    passos: [
      {
        titulo: "Abrir o Financeiro",
        etapas: [
          "Clique em Financeiro e digite a senha de administração do escritório.",
          "Ela vale por 30 minutos; depois disso é pedida de novo, para um computador aberto não entregar o caixa.",
        ],
      },
      {
        titulo: "Navegar pelas abas",
        etapas: [
          "Panorama: recebido, pago, saldo e a previsão de arrecadação mês a mês (lida direto do Asaas, com as mensalidades que ainda vão ser emitidas).",
          "Lançamentos do mês: tudo o que entrou e saiu. “Novo lançamento” lança receita ou despesa; a IA pode ler a conta.",
          "Fechamento de caixa: a foto de cada mês, por forma de pagamento e por quem recebeu. Fecha sozinho na virada.",
          "Metas do ano: meta, média mensal, ritmo e projeção.",
          "Despesas fixas: aluguel, contador, sistemas… geradas todo mês no dia certo.",
        ],
      },
      {
        titulo: "Dar baixa num lançamento",
        etapas: [
          "Na lista, clique em “em aberto” para marcar como pago (ou recebido).",
          "Clique de novo para desfazer.",
        ],
      },
    ],
    dicas: [
      "A aba que você abriu vai para o endereço: mande o link para o sócio e ele abre direto nela.",
      "Cobrança paga no Asaas entra sozinha como receita, na data do pagamento.",
    ],
  },
  {
    id: "despesas",
    grupo: "Dinheiro",
    titulo: "Despesas",
    resumo:
      "Todas as despesas, pagas e a pagar, com filtros, totais por categoria e dois jeitos rápidos de lançar: ler várias contas de uma vez ou digitar.",
    caminho: "Financeiro › Despesas",
    papeis: ["ADMIN"],
    modulo: "Avançado e Completo · leitura de contas no Completo",
    telas: [{ arquivo: "despesas", legenda: "Filtros, totais, despesas por categoria e a lista" }],
    passos: [
      {
        titulo: "Consultar o que o escritório gastou",
        etapas: [
          "Escolha o ano, o mês (ou o ano inteiro), a categoria, a situação (pagas, a pagar, vencidas) e, se quiser, uma busca.",
          "Clique em “Filtrar”. Os totais mostram o período, o pago, o que falta pagar e o vencido.",
          "Clique numa categoria para ver só as despesas dela.",
        ],
      },
      {
        titulo: "Ler várias contas de uma vez",
        etapas: [
          "Em “Ler várias contas de uma vez”, escolha os arquivos (água, energia, telefone, boletos — PDF ou foto).",
          "Clique em “Ler as contas”. Cada arquivo é lido separado e cada conta vira uma linha.",
          "Confira valor, vencimento e categoria (linhas amarelas pedem atenção), desmarque o que não quer e clique em “Lançar marcadas”.",
        ],
      },
      {
        titulo: "Lançar à mão, com repetição",
        etapas: [
          "Clique em “Lançar despesa à mão” (salário, reembolso, compra no caixa).",
          "Preencha descrição, valor, categoria e vencimento, e diga se já está paga.",
          "Em “Repetir todo mês”, escolha “Sim”: vira despesa fixa, gerada nos próximos meses.",
        ],
      },
    ],
    dicas: ["Contas vencidas e dos próximos 7 dias aparecem na tela inicial do administrador."],
  },
  {
    id: "relatorios",
    grupo: "Dinheiro",
    titulo: "Relatórios",
    resumo: "Relatórios em PDF por período, com gráficos, para imprimir, arquivar ou mandar ao sócio e ao contador.",
    caminho: "Menu › Relatórios",
    papeis: ["ADMIN"],
    telas: [{ arquivo: "relatorios", legenda: "Escolha o período e baixe o PDF" }],
    passos: [
      {
        titulo: "Gerar um relatório",
        etapas: [
          "Escolha o período: este mês, mês passado, este ano, ano passado, últimos 12 meses ou datas à sua escolha.",
          "Clique em “Baixar PDF” no relatório: Clientes, Cobranças e inadimplência, Financeiro (resultado), Caixa (movimento) ou Previsões.",
          "Os relatórios de dinheiro pedem o Financeiro destrancado.",
        ],
      },
    ],
  },
  {
    id: "modelos",
    grupo: "Escritório",
    titulo: "Modelos de documento",
    resumo:
      "O sistema já vem com procuração, contrato, declaração e recibo para o escritório emitir no primeiro dia. Depois, troque pelos modelos do escritório, em Word.",
    caminho: "Menu › Modelos",
    papeis: ["ADMIN"],
    telas: [{ arquivo: "modelos", legenda: "Baixe, edite no Word e envie o seu" }],
    passos: [
      {
        titulo: "Usar o modelo do escritório",
        etapas: [
          "Clique em “Baixar o do sistema” para ter o ponto de partida.",
          "Abra no Word e deixe do jeito do escritório: timbre, fonte, cláusulas. Os campos entre chaves (ex.: {nome}) ficam como estão.",
          "Clique em “Enviar o meu”. A partir daí, é o seu que sai.",
          "Os dois ficam guardados: escolha qual sai nas peças com um clique.",
        ],
      },
    ],
    dicas: ["O modelo do sistema é só o ponto de partida: o advogado responsável lê e adapta antes de usar."],
  },
  {
    id: "arquivos",
    grupo: "Escritório",
    titulo: "Arquivos",
    resumo:
      "Os documentos do escritório organizados por cliente e processo, com cópia na pasta do OneDrive ou do Google Drive do escritório.",
    caminho: "Menu › Arquivos",
    papeis: ["ADMIN", "ADVOGADO", "APOIO"],
    modulo: "Profissional, Avançado e Completo",
    telas: [{ arquivo: "arquivos", legenda: "Arquivos por cliente" }],
    passos: [
      {
        titulo: "Guardar e encontrar arquivos",
        etapas: [
          "Anexe os arquivos na ficha do cliente, na tarefa ou no processo: eles aparecem aqui.",
          "Com a nuvem conectada em Integrações, o sistema cria a pasta de cada cliente e copia os documentos para lá.",
        ],
      },
    ],
  },
  {
    id: "equipe",
    grupo: "Escritório",
    titulo: "Equipe e permissões",
    resumo:
      "Quem trabalha no escritório e o que cada pessoa vê. O administrador libera as áreas de cada um — estagiário não vê o que é privativo de advogado.",
    caminho: "Menu › Equipe",
    papeis: ["ADMIN"],
    telas: [{ arquivo: "equipe", legenda: "Cadastro da equipe e o uso da faixa contratada" }],
    passos: [
      {
        titulo: "Cadastrar uma pessoa",
        etapas: [
          "Preencha nome, e-mail, uma senha provisória (mínimo 10 caracteres) e o papel: Administrador, Advogado ou Apoio.",
          "Para advogado, informe a OAB.",
          "Clique em “Cadastrar” e passe a senha provisória à pessoa; ela troca em Minha conta.",
        ],
      },
      {
        titulo: "Liberar ou fechar áreas",
        etapas: [
          "Clique em “Editar” na pessoa.",
          "Marque as áreas que ela pode abrir (Agenda, Clientes, Cobranças, Financeiro…). Em Cobranças, dá para separar emitir, dar baixa e desfazer.",
          "Salve. O menu dela muda na hora.",
        ],
      },
    ],
    dicas: [
      "“Baixar todos os dados do escritório” exporta clientes, processos, agenda, financeiro e faturas a qualquer momento. Os dados são do escritório.",
      "A faixa do plano mostra quantos advogados e quantas pessoas de apoio cabem.",
    ],
  },
  {
    id: "conta",
    grupo: "Escritório",
    titulo: "Minha conta",
    resumo: "As preferências de cada pessoa: senha, segundo fator, alerta sonoro, avisos por e-mail e WhatsApp e a agenda no NetLead.",
    caminho: "Menu › Minha conta",
    papeis: ["ADMIN", "ADVOGADO", "APOIO"],
    telas: [{ arquivo: "conta", legenda: "Cada pessoa decide o que recebe" }],
    passos: [
      {
        titulo: "Ajustar a sua conta",
        etapas: [
          "Alerta sonoro da agenda: ligue e clique em “Testar o som”.",
          "Avisos: escolha receber o resumo das publicações e o lembrete de compromisso 24 horas antes.",
          "WhatsApp: informe o telefone e marque “Receber também no WhatsApp”.",
          "Segurança: troque a senha e clique em “Ativar segundo fator” (leia o QR Code com o aplicativo autenticador).",
        ],
      },
      {
        titulo: "Bloquear seus horários no NetLead",
        etapas: [
          "Gere a chave da sua agenda no NetLead e cole em “Chave da sua agenda no NetLead”.",
          "Clique em “Guardar e testar”: aparece de quem é a agenda do outro lado.",
          "Marque “Bloquear meus horários no NetLead”. Só sai o horário e o tipo; nada de cliente ou processo.",
        ],
      },
    ],
  },
  {
    id: "integracoes",
    grupo: "Escritório",
    titulo: "Integrações",
    resumo:
      "As contas do próprio escritório que fazem o sistema trabalhar sozinho. As credenciais ficam cifradas e nunca aparecem de volta na tela.",
    caminho: "Menu › Integrações",
    papeis: ["ADMIN"],
    telas: [{ arquivo: "integracoes", legenda: "Cada integração, com a situação da conexão" }],
    passos: [
      {
        titulo: "Conectar uma conta",
        etapas: [
          "E-mail (SMTP): compromissos, recibos e avisos saem pelo domínio do escritório.",
          "Asaas ou InfinitePay: boleto, Pix e cartão na conta do escritório. Cole a chave de API gerada no painel deles.",
          "Autentique: assinatura eletrônica de contratos e procurações.",
          "Certificado e-CNPJ: assinatura das notas fiscais.",
          "OneDrive ou Google Drive: a pasta de cada cliente na nuvem do escritório.",
          "Em cada uma, clique em “Conectar”, siga o passo a passo da tela e salve.",
        ],
      },
    ],
  },
  {
    id: "configuracoes",
    grupo: "Escritório",
    titulo: "Configurações do escritório",
    resumo:
      "A identidade do escritório (logo, cores, CNPJ, endereço), a senha de administração, o certificado digital e o teste do WhatsApp.",
    caminho: "Menu › Configurações",
    papeis: ["ADMIN"],
    telas: [{ arquivo: "configuracoes", legenda: "Logo e cores mudam o sistema inteiro na hora" }],
    passos: [
      {
        titulo: "Deixar o sistema com a cara do escritório",
        etapas: [
          "Escolha a cor principal e a de destaque; a prévia mostra como fica.",
          "Envie o logotipo (PNG, JPG, WEBP ou SVG, até 1 MB). As cores podem seguir o logo.",
          "Preencha CNPJ, telefone de atendimento, cidade e endereço da sede: entram nas peças e nas mensagens ao cliente.",
        ],
      },
      {
        titulo: "Senha de administração",
        etapas: [
          "Crie a senha de administração (diferente da senha de login).",
          "Ela protege o Financeiro, o certificado e os dados sensíveis, e é pedida de novo a cada 30 minutos.",
        ],
      },
    ],
    dicas: ["Com o WhatsApp contratado, “Testar o WhatsApp” manda uma mensagem ao seu celular e só diz “funcionando” quando a entrega é confirmada."],
  },
  {
    id: "celular",
    grupo: "Escritório",
    titulo: "No celular",
    resumo:
      "O sistema funciona inteiro no navegador do celular, sem instalar nada. O menu fica no botão do canto superior esquerdo.",
    caminho: "Navegador do celular",
    papeis: ["ADMIN", "ADVOGADO", "APOIO"],
    telas: [
      { arquivo: "celular-inicio", legenda: "A tela inicial no celular", celular: true },
      { arquivo: "celular-menu", legenda: "O menu aberto", celular: true },
    ],
    passos: [
      {
        titulo: "Deixar um atalho na tela do celular",
        etapas: [
          "Abra o endereço do escritório no navegador do celular e entre.",
          "iPhone (Safari): toque em Compartilhar › “Adicionar à Tela de Início”.",
          "Android (Chrome): toque nos três pontos › “Adicionar à tela inicial”.",
        ],
      },
    ],
  },
];

export const PERGUNTAS = [
  {
    p: "Meus dados ficam separados dos outros escritórios?",
    r: "Sim. Cada escritório tem o seu endereço e os dados são isolados no banco de dados: uma consulta de um escritório nunca enxerga o de outro. Senhas e credenciais de integração ficam cifradas.",
  },
  {
    p: "O sistema cria prazos sozinho?",
    r: "Não. O sistema lê a publicação, calcula o prazo fatal e sugere a tarefa, mas quem cria é uma pessoa, depois de conferir. A conta do prazo aparece explicada (dias úteis, feriados, CPC 219 e 224) para ser conferida.",
  },
  {
    p: "Posso usar a inteligência artificial sem medo de erro?",
    r: "A IA só propõe: nada é gravado sem alguém clicar. O que ela leu com dúvida chega marcado (“confira” ou “confira com atenção”). Confira sempre nos autos e nos documentos originais.",
  },
  {
    p: "Quem vê o Financeiro?",
    r: "Só o administrador, e só depois de digitar a senha de administração, que vale por 30 minutos. A equipe pode ter acesso a Cobranças sem ver o caixa.",
  },
  {
    p: "Por que o aviso de tarefa não chegou na hora?",
    r: "Os avisos de tarefa saem em duas entregas por dia, às 12h e às 18h. Tarefa urgente com entrega no mesmo dia, ou com prazo antes da próxima entrega, sai na hora.",
  },
  {
    p: "O cliente recebe mensagens do sistema?",
    r: "Recebe o que o escritório usa: confirmação e lembrete de compromisso, link de pagamento, recibo, nota fiscal e documentos para assinar, pelo e-mail e WhatsApp do escritório. Na ficha do cliente dá para desligar cada canal.",
  },
  {
    p: "Criei uma cobrança direto no Asaas. Ela aparece aqui?",
    r: "Use “Conferir no Asaas”, em Cobranças: aparece o que está lá e não aqui, e você escolhe o que trazer. A previsão de arrecadação do Financeiro já conta essas cobranças.",
  },
  {
    p: "Posso exportar meus dados?",
    r: "Sim, a qualquer momento: em Equipe, “Baixar todos os dados do escritório”. Inclui clientes, processos, agenda, financeiro e faturas.",
  },
  {
    p: "Esqueci a senha de administração. E agora?",
    r: "Fale com o suporte: por segurança, a senha de administração não é recuperada por e-mail.",
  },
  {
    p: "O sistema funciona sem internet?",
    r: "Não: ele roda no navegador e precisa de conexão. Em compensação, abre em qualquer computador ou celular, sem instalar nada.",
  },
];

export const CONTATO = {
  whatsapp: "(16) 99230-4561",
  whatsappLink: "https://wa.me/5516992304561?text=Ol%C3%A1!%20Preciso%20de%20ajuda%20com%20o%20BirdJud.",
  email: "contato@blackbirdsolucoes.com.br",
  empresa: "Blackbird Soluções Estratégicas Ltda.",
};
