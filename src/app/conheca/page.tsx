import type { Metadata } from "next";
import "./conheca.css";

export const metadata: Metadata = {
  title: "Conheça o BirdJud · gestão jurídica com inteligência artificial",
  description:
    "O que o BirdJud faz pelo escritório, com telas reais: a IA que lê documentos e publicações, o código que protege o cliente do golpe do falso advogado, cobrança, nota fiscal, financeiro e planos.",
  openGraph: {
    title: "Conheça o BirdJud",
    description: "Gestão jurídica com inteligência artificial e proteção contra o golpe do falso advogado.",
    images: ["/marca/quadrado-escuro.jpg"],
  },
};

/**
 * Pagina de divulgacao, publica: o sistema apresentado a quem ainda nao e
 * cliente, com telas do escritorio de demonstracao (public/conheca/, dados
 * inventados). Conteudo estatico de proposito: e material de divulgacao, e
 * muda quando o produto muda. Precos aqui repetem a tabela de /planos — ao
 * mudar a tabela, mudar aqui tambem.
 */
export default function PaginaConheca() {
  return (
    <div className="conheca">
      <header className="capa">
        <div className="dentro">
          <div className="marca"><img src="/marca/simbolo.png" alt="" /><div><a href="/"><b>BirdJud</b></a><br /><span>by Blackbird</span></div></div>
          <p className="sobre">Gestão jurídica com inteligência artificial</p>
          <h1>Mais tempo para o que realmente importa.</h1>
          <p className="linha-fina">O BirdJud cuida do que consome o dia do escritório: publicação, prazo, cadastro, cobrança e nota. A IA lê os papéis, o sistema calcula os prazos, e cada cliente recebe um código que barra o golpe do falso advogado.</p>
          <p><a className="cn-chamada" href="/cadastro">Testar 14 dias, sem cartão</a> <a className="cn-chamada claro" href="/planos">Ver os planos</a></p>
          <div className="fatos">
            <div><b>R$ 149</b><span>por mês é a entrada, para um advogado</span></div>
            <div><b>R$ 279</b><span>o plano Completo, com IA, WhatsApp e assinatura</span></div>
            <div><b>14 dias</b><span>de teste, sem cartão</span></div>
            <div><b>5 trabalhos</b><span>que a IA faz no lugar da digitação</span></div>
          </div>
        </div>
      </header>

      <nav className="indice" aria-label="Seções">
        <div className="dentro">
          <a href="#inicio">O dia do escritório</a><a href="#ia">Inteligência artificial</a><a href="#codigo">Falso advogado</a><a href="#sistema">O sistema inteiro</a><a href="#diferenciais">Diferenciais</a><a href="#planos">Planos</a><a href="#perguntas">Perguntas frequentes</a>
        </div>
      </nav>

      <section id="inicio">
        <div className="dentro">
          <div className="cabeca">
            <p className="sobre">O dia do escritório</p>
            <h2>Tudo o que pede atenção, numa tela</h2>
            <p>Publicação que chega, prazo que corre, cadastro para digitar, cobrança para emitir, nota para tirar. O BirdJud cuida disso para que a advocacia volte a ser o trabalho principal.</p>
          </div>
          <div className="par">
            <div className="texto">
              <h3>Comece o dia por aqui</h3>
              <p>Ao entrar, o sistema mostra tarefas com prazo perto, a agenda das próximas 48 horas e as publicações não lidas, já com o prazo indicado.</p>
            </div>
            <figure><img src="/conheca/inicio.jpg" alt="Tela inicial do BirdJud com tarefas, agenda e publicações não lidas" loading="lazy" /><figcaption>Tela inicial, com os dados do escritório de demonstração.</figcaption></figure>
          </div>
        </div>
      </section>

      <section id="ia">
        <div className="dentro">
          <div className="cabeca">
            <p className="sobre">Inteligência artificial</p>
            <h2>A IA faz cinco trabalhos que hoje são digitação</h2>
            <p>Não é um chat solto. A IA está dentro das telas, no ponto exato em que alguém teria de digitar ou ler um papel. Em todas elas o resultado chega para conferir: nada é gravado sem alguém olhar.</p>
          </div>

          <div className="par">
            <div className="texto">
              <span className="cn-rotulo">1 · Cadastro</span>
              <h3>Lê o documento e preenche o cadastro</h3>
              <p>Envie o RG, a CNH ou a conta de luz do cliente. A IA devolve nome, CPF, RG, nascimento, estado civil, profissão e endereço, cada campo com a origem (“CIN, campo CPF”) e o grau de certeza: <b>leitura clara</b> ou <b>confira</b>.</p>
              <p>Vale também para processo (a partir da petição), compromisso (a partir da intimação), tarefa, conta a pagar e cadastro fiscal.</p>
            </div>
            <figure><img src="/conheca/ia-documento.jpg" alt="Leitura de documento por IA com cada campo marcado como leitura clara ou confira" loading="lazy" /><figcaption>O que a IA leu, campo a campo, antes de gravar.</figcaption></figure>
          </div>

          <div className="par inverso">
            <div className="texto">
              <span className="cn-rotulo">2 · Publicações</span>
              <h3>Lê a publicação e sugere a tarefa, com o prazo</h3>
              <p>As OABs do escritório são consultadas no Diário de Justiça (DJEN) todo dia. Para cada publicação, a IA diz o que aconteceu e o que fazer: contestar vira tarefa, audiência vira compromisso.</p>
              <p>O prazo fatal quem calcula é o sistema, com o calendário do escritório, e a entrega sugerida cai três dias úteis antes. Um clique cria a tarefa já com o responsável. A IA sugere; o advogado confere nos autos e confirma.</p>
            </div>
            <figure><img src="/conheca/ia-publicacao.jpg" alt="Publicação do DJEN com sugestão da IA de criar tarefa de contestação e prazo fatal calculado" loading="lazy" /><figcaption>Sugestão da IA, prazo fatal e botão de criar a tarefa.</figcaption></figure>
          </div>

          <div className="par">
            <div className="texto">
              <span className="cn-rotulo">3 · Entrevistas</span>
              <h3>Transforma a primeira conversa em documento</h3>
              <p>Antes da conversa, a IA sugere o roteiro de perguntas para aquele tipo de caso. Durante, o sistema grava e transcreve. Depois, organiza tudo em fatos na ordem do tempo, o que a pessoa quer, documentos que ela tem, documentos a pedir, testemunhas e pontos a verificar. É apoio de triagem: não é parecer e não substitui a análise do advogado.</p>
            </div>
            <figure><img src="/conheca/ia-entrevista.jpg" alt="Entrevista organizada pela IA em fatos, pretensões, documentos e pontos a verificar" loading="lazy" /><figcaption>A entrevista organizada, para conferir contra o que foi dito.</figcaption></figure>
          </div>

          <div className="par inverso">
            <div className="texto">
              <span className="cn-rotulo">4 · Cadastros antigos</span>
              <h3>Completa o cadastro com os documentos já guardados</h3>
              <p>Todo escritório tem cliente cadastrado só com nome e telefone. O sistema lista quem está incompleto, e a IA lê os documentos que já estão na pasta de cada um para preencher o que falta.</p>
              <ul>
                <li>Só preenche campo vazio. O que alguém digitou não é trocado.</li>
                <li>Confere se o documento é mesmo daquele cliente. Na tela ao lado, a CNH estava em nome de outra pessoa e nada foi preenchido.</li>
                <li>Leitura com dúvida fica de fora, e a tela diz o motivo.</li>
              </ul>
            </div>
            <figure><img src="/conheca/ia-cadastro.jpg" alt="Lista de cadastros incompletos com o resultado da leitura por IA de cada cliente" loading="lazy" /><figcaption>Um cadastro preenchido e outro recusado, com a explicação.</figcaption></figure>
          </div>

          <div className="par">
            <div className="texto">
              <span className="cn-rotulo">5 · Contas do escritório</span>
              <h3>Lê as contas do mês de uma vez</h3>
              <p>Junte água, energia, internet e os boletos. Cada arquivo vira uma linha com valor, vencimento, categoria e a linha digitável. O boleto fica guardado junto da conta, e no dia de pagar basta copiar a linha.</p>
            </div>
            <figure><img src="/conheca/ia-contas.jpg" alt="Três contas lidas pela IA com valor, vencimento, categoria e linha digitável" loading="lazy" /><figcaption>Três contas lidas, prontas para lançar.</figcaption></figure>
          </div>

          <p className="nota">A IA faz parte do plano Completo, com franquia mensal incluída. Nos outros planos o cadastro é digitado, e tudo o mais funciona igual.</p>
        </div>
      </section>

      <section id="codigo">
        <div className="dentro">
          <div className="cabeca">
            <p className="sobre">Contra o golpe do falso advogado</p>
            <h2>O sistema de gestão que protege o seu cliente do falso advogado</h2>
            <p>O golpista liga com o nome do cliente, o número do processo e o nome do advogado, tudo copiado do andamento público. Diz que há dinheiro para liberar e pede um Pix de “taxa”. Ele sabe tudo, menos uma coisa: o código que só o escritório e o cliente conhecem.</p>
          </div>

          <div className="par">
            <div className="texto">
              <div className="cartao-codigo"><small>Código de atendimento</small><b>GIRASSOL 27</b><span>Uma palavra simples e dois números. Fácil de falar ao telefone e de lembrar.</span></div>
              <h3>A regra cabe em duas frases</h3>
              <p><b>O escritório diz o código</b> no começo de toda conversa. Quem liga em nome do escritório e não sabe o código não é o escritório.</p>
              <p><b>O cliente nunca informa o código</b> a ninguém. Quem pede o código é o golpista.</p>
            </div>
            <figure><img src="/conheca/codigos.jpg" alt="Tela Códigos de atendimento com o código de cada cliente e o botão de abrir o WhatsApp" loading="lazy" /><figcaption>A tela Códigos: quem atende vê o código e abre o WhatsApp com ele já escrito.</figcaption></figure>
          </div>

          <div className="pecas">
            <div><b>Um código por cliente</b><span>Criado sozinho no cadastro, único no escritório. Vazou? O administrador troca e o antigo deixa de valer na hora.</span></div>
            <div><b>No contrato, em folha própria</b><span>Uma cláusula explica a regra, e o código sai em letra grande numa folha destacada, para o cliente guardar.</span></div>
            <div><b>À mão em todo atendimento</b><span>Um botão abre o WhatsApp do cliente com o código já escrito. O número vem sempre do cadastro, nunca digitado na hora.</span></div>
            <div><b>O cliente aprende a regra</b><span>Cinco avisos, um por semana, por e-mail e WhatsApp. Só o primeiro leva o código; os outros repetem as regras.</span></div>
            <div><b>Código esquecido não volta por mensagem</b><span>Só pessoalmente ou no e-mail que já estava no cadastro. Não existe campo para outro destino: é ali que o golpe começaria.</span></div>
            <div><b>Contra o golpe da taxa</b><span>O cliente é avisado, por escrito, de que o escritório nunca pede Pix, depósito ou taxa para liberar dinheiro de processo.</span></div>
          </div>

          <div className="par inverso">
            <div className="texto">
              <h3>O cliente leva a regra para casa</h3>
              <p>Todo contrato de honorários gerado pelo sistema ganha esta folha no fim, no Word e no PDF. No dia da ligação estranha, o cliente acha o código em segundos.</p>
              <p>A proteção está em <b>todos os planos</b>, inclusive no Essencial. Procuramos e não encontramos outro sistema de gestão da advocacia que faça isso.</p>
            </div>
            <figure className="folha"><img src="/conheca/folha-do-codigo.jpg" alt="Folha do código de atendimento anexada ao contrato de honorários" loading="lazy" /><figcaption>A folha do código, no fim do contrato de honorários.</figcaption></figure>
          </div>
        </div>
      </section>

      <section id="sistema">
        <div className="dentro">
          <div className="cabeca">
            <p className="sobre">Tudo o que o sistema tem</p>
            <h2>O escritório inteiro num endereço só</h2>
            <p>Do primeiro atendimento à nota fiscal. O plano em que cada recurso entra aparece ao lado.</p>
          </div>
          <div className="grupos">
            <div className="grupo">
              <h3>O dia a dia</h3>
              <dl>
                <dt>Tela inicial</dt><dd>O que pede atenção agora: prazos, agenda, publicações e pendências.</dd>
                <dt>Busca única</dt><dd>Cliente, processo e publicação na mesma barra, em todas as telas.</dd>
                <dt>Agenda</dt><dd>Audiências, perícias e atendimentos, com responsável, sala virtual e aviso a quem precisa comparecer.</dd>
                <dt>Tarefas e metas</dt><dd>Peças e providências com responsável, data de entrega e prazo fatal.</dd>
                <dt>Processos</dt><dd>Uma ficha por processo: cliente, vara, publicações, tarefas, compromissos e o que há a receber.</dd>
                <dt>Publicações do DJEN</dt><dd>Captura diária pelas OABs do escritório, com prazo calculado. <i>Profissional em diante</i></dd>
              </dl>
            </div>
            <div className="grupo">
              <h3>Clientes e documentos</h3>
              <dl>
                <dt>Clientes</dt><dd>Ficha completa, representantes, menor de idade, importação de planilha e pendências do cadastro.</dd>
                <dt>Código de atendimento</dt><dd>A barreira contra o falso advogado. <i>Todos os planos</i></dd>
                <dt>Documentos prontos</dt><dd>Procuração, contrato de honorários, declaração e recibo saem do cadastro, em Word e PDF.</dd>
                <dt>Assinatura eletrônica</dt><dd>O documento vai para o cliente assinar, sem imprimir. <i>Completo</i></dd>
                <dt>Entrevistas</dt><dd>Anotação em todos os planos; roteiro, transcrição e organização por IA. <i>Completo</i></dd>
                <dt>Modelos do escritório</dt><dd>Troque os modelos do sistema pelos seus, em Word.</dd>
                <dt>Arquivos</dt><dd>Por cliente e processo, com cópia no OneDrive ou Google Drive do escritório. <i>Profissional em diante</i></dd>
              </dl>
            </div>
            <div className="grupo">
              <h3>Dinheiro</h3>
              <dl>
                <dt>Cobranças</dt><dd>Boleto, Pix e cartão na conta do próprio escritório, com baixa automática e mensalidades. <i>Avançado em diante</i></dd>
                <dt>Nota fiscal de serviço</dt><dd>NFS-e pelo Sistema Nacional, com o certificado do escritório. <i>Avançado em diante</i></dd>
                <dt>Financeiro</dt><dd>Lançamentos, previsão de arrecadação, fechamento de caixa e metas, atrás de uma segunda senha. <i>Avançado em diante</i></dd>
                <dt>Contas a pagar</dt><dd>Boleto guardado, linha digitável, “para pagar hoje” e despesas fixas. Quem paga as contas não precisa da senha do financeiro.</dd>
                <dt>Relatórios</dt><dd>PDF por período, com gráficos, para o sócio e o contador.</dd>
              </dl>
            </div>
            <div className="grupo">
              <h3>O escritório</h3>
              <dl>
                <dt>Equipe e permissões</dt><dd>O administrador libera cada área por pessoa. Estagiário não vê o que é privativo de advogado.</dd>
                <dt>Avisos automáticos</dt><dd>Lembrete de compromisso, resumo do dia e tarefas por e-mail <i>Profissional em diante</i> e WhatsApp <i>Completo</i></dd>
                <dt>Marca do escritório</dt><dd>Endereço próprio, logo e cores. Quem entra vê o escritório, não o BirdJud.</dd>
                <dt>Integrações</dt><dd>E-mail, Asaas ou InfinitePay, assinatura eletrônica, certificado e-CNPJ, OneDrive e Google Drive.</dd>
                <dt>Primeiros passos e manual</dt><dd>Roteiro de implantação que se marca sozinho e manual com telas em birdjud.com.br/manual.</dd>
                <dt>Celular</dt><dd>Tudo no navegador do telefone, sem instalar aplicativo.</dd>
              </dl>
            </div>
          </div>
          <div className="galeria">
            <figure><img src="/conheca/agenda.jpg" alt="Agenda do escritório" loading="lazy" /><figcaption>Agenda, com responsável e sala virtual.</figcaption></figure>
            <figure><img src="/conheca/tarefas.jpg" alt="Tarefas com prazo fatal" loading="lazy" /><figcaption>Tarefas, com entrega e prazo fatal.</figcaption></figure>
            <figure><img src="/conheca/cliente.jpg" alt="Ficha do cliente" loading="lazy" /><figcaption>A ficha do cliente.</figcaption></figure>
            <figure><img src="/conheca/cobrancas.jpg" alt="Cobranças do escritório" loading="lazy" /><figcaption>Cobranças, na conta do próprio escritório.</figcaption></figure>
            <figure><img src="/conheca/financeiro.jpg" alt="Panorama financeiro do mês" loading="lazy" /><figcaption>Financeiro: recebido, pago e previsão.</figcaption></figure>
            <figure><img src="/conheca/contas.jpg" alt="Contas para pagar hoje com linha digitável" loading="lazy" /><figcaption>Para pagar hoje, com a linha digitável.</figcaption></figure>
          </div>
          <div className="par">
            <div className="texto">
              <h3>No celular, do mesmo jeito</h3>
              <p>O advogado no fórum abre a agenda, confere a tarefa e diz o código do cliente pelo telefone. Não há aplicativo para instalar nem atualizar.</p>
            </div>
            <figure><div className="celulares"><img src="/conheca/celular-inicio.jpg" alt="Tela inicial no celular" loading="lazy" /><img src="/conheca/celular-codigos.jpg" alt="Códigos de atendimento no celular" loading="lazy" /></div><figcaption>O sistema no navegador do celular.</figcaption></figure>
          </div>
        </div>
      </section>

      <section id="diferenciais">
        <div className="dentro">
          <div className="cabeca">
            <p className="sobre">Por que o BirdJud</p>
            <h2>Dez razões para escolher o BirdJud</h2>
          </div>
          <div className="diferenciais">
            <div><b>IA dentro do preço</b><span>No plano Completo a IA já vem com franquia mensal. Não é módulo cobrado à parte depois da assinatura.</span></div>
            <div><b>IA que pede conferência</b><span>Cada leitura mostra a origem e o grau de certeza. Só preenche campo vazio e recusa documento de outra pessoa.</span></div>
            <div><b>Proteção contra o falso advogado</b><span>Código por cliente, folha no contrato e avisos automáticos, em todos os planos.</span></div>
            <div><b>Prazo calculado pelo sistema</b><span>A conta usa o calendário do escritório, e a entrega sugerida fica três dias úteis antes do prazo fatal.</span></div>
            <div><b>A marca é do escritório</b><span>Endereço próprio (seu-escritorio.birdjud.com.br), logo e cores. O cliente do escritório não vê a nossa marca.</span></div>
            <div><b>Dados isolados</b><span>Cada escritório tem os dados separados dos demais no próprio banco, e as credenciais ficam cifradas.</span></div>
            <div><b>Financeiro com segunda senha</b><span>O caixa pede uma senha a mais, que vale por 30 minutos. Computador aberto não entrega o financeiro.</span></div>
            <div><b>O dinheiro cai na conta do escritório</b><span>A cobrança é emitida na conta de pagamentos do próprio escritório. O BirdJud não fica no meio.</span></div>
            <div><b>Paga pelo que usa</b><span>Quatro planos prontos ou módulo a módulo. Se um plano pronto cobre o que foi escolhido e sai mais barato, é ele que vale.</span></div>
            <div><b>Feito por advogados</b><span>Cada tela nasceu de uma rotina real de escritório, do prazo à cobrança de honorários.</span></div>
          </div>
        </div>
      </section>

      <section id="planos">
        <div className="dentro">
          <div className="cabeca">
            <p className="sobre">Planos e preços</p>
            <h2>Do advogado sozinho ao escritório de 25</h2>
            <p>Valores mensais. No trimestral há 5% de desconto e no anual, 10%. Teste de 14 dias, sem cartão.</p>
          </div>
          <div className="rolagem">
            <table>
              <thead><tr><th>Plano</th><th>O que entra</th><th className="n">1 advogado</th><th className="n">Até 3</th><th className="n">Até 10</th><th className="n">Até 25</th></tr></thead>
              <tbody>
                <tr><td>Essencial</td><td>Clientes, processos, agenda, prazos, documentos e código de atendimento</td><td className="n">R$ 149</td><td className="n">R$ 209</td><td className="n">R$ 339</td><td className="n">R$ 559</td></tr>
                <tr><td>Profissional</td><td>+ publicações do DJEN, arquivos e aviso por e-mail</td><td className="n">R$ 189</td><td className="n">R$ 249</td><td className="n">R$ 409</td><td className="n">R$ 669</td></tr>
                <tr><td>Avançado</td><td>+ cobranças, financeiro e nota fiscal de serviço</td><td className="n">R$ 229</td><td className="n">R$ 309</td><td className="n">R$ 489</td><td className="n">R$ 809</td></tr>
                <tr className="cn-realce"><td>Completo</td><td>+ inteligência artificial, aviso por WhatsApp e assinatura eletrônica</td><td className="n">R$ 279</td><td className="n">R$ 369</td><td className="n">R$ 609</td><td className="n">R$ 979</td></tr>
              </tbody>
            </table>
          </div>
          <p><a className="cn-chamada escuro" href="/cadastro">Criar o sistema do meu escritório</a></p>
          <p className="nota">A faixa de um advogado inclui duas pessoas de apoio. Acima de 25 advogados o preço é sob consulta. Os valores atualizados e o simulador para montar o seu plano estão em <a href="/planos">birdjud.com.br/planos</a>.</p>
        </div>
      </section>

      <section id="perguntas">
        <div className="dentro">
          <div className="cabeca">
            <p className="sobre">Perguntas frequentes</p>
            <h2>O que os escritórios perguntam antes de começar</h2>
          </div>
          <div className="objecoes">
            <div><b>Já uso outro sistema. Como trago meus clientes?</b><span>A base entra por planilha (Excel ou CSV), com uma prévia que aponta duplicados e documentos inválidos antes de gravar. E são 14 dias para comparar lado a lado, sem cartão.</span></div>
            <div><b>E se a IA errar?</b><span>Ela nunca grava sozinha. Cada campo vem com a origem e a marca “confira” quando há dúvida, o prazo é calculado pelo sistema e não pela IA, e o que ela preencheu fica sinalizado na ficha até alguém conferir.</span></div>
            <div><b>Meus dados ficam seguros?</b><span>Os dados de cada escritório são isolados dos demais, as credenciais das integrações ficam cifradas e não voltam para a tela, o financeiro pede uma segunda senha e cada pessoa só vê as áreas liberadas para ela.</span></div>
            <div><b>Preciso instalar alguma coisa?</b><span>Não. O sistema funciona no navegador, no computador e no celular, no endereço do seu escritório.</span></div>
            <div><b>Posso contratar só uma parte?</b><span>Sim. Há quatro planos prontos, ou você monta o seu, módulo a módulo. Se um plano pronto cobre o que você escolheu e sai mais barato, é ele que vale.</span></div>
            <div><b>E se o cliente esquecer o código?</b><span>O escritório entrega de novo pessoalmente ou pelo e-mail que já estava no cadastro. Nunca para um número ou e-mail informado na hora, porque é exatamente isso que o golpista tentaria.</span></div>
          </div>
        </div>
      </section>

      <section id="comecar" className="fecho">
        <div className="dentro">
          <div className="cabeca">
            <p className="sobre">Comece hoje</p>
            <h2>Teste o BirdJud por 14 dias, sem cartão</h2>
            <p>Em poucos minutos o seu escritório tem endereço próprio, com a sua marca. O roteiro de primeiros passos conduz a implantação, e o manual com telas está em <a href="/manual">birdjud.com.br/manual</a>.</p>
          </div>
          <p><a className="cn-chamada escuro" href="/cadastro">Criar o sistema do meu escritório</a></p>
        </div>
      </section>

      <footer>
        <div className="dentro">BirdJud, by Blackbird · birdjud.com.br · As telas mostram um escritório de demonstração, com dados fictícios. Nas telas de IA, a resposta exibida é um exemplo.</div>
      </footer>
    </div>
  );
}
