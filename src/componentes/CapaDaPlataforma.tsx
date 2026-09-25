import Link from "next/link";
import { CabecalhoPublico } from "./CabecalhoPublico";
import { MarcaBirdJud } from "./MarcaBirdJud";
import { Tela } from "./Tela";
import { Icone, type NomeDeIcone } from "./Icone";
import { contaDoPlano, PLANO, PLANOS } from "@/lib/planos";
import { FAIXAS_PUBLICADAS, rotuloDoTamanho } from "@/lib/catalogo";
import { emReais } from "@/lib/dinheiro";

type Demonstracao = {
  arquivo: string;
  endereco: string;
  sobretitulo: string;
  titulo: string;
  texto: string;
  pontos: string[];
};

const DEMONSTRACOES: Demonstracao[] = [
  {
    arquivo: "leitura-ia",
    endereco: "seu-escritorio.birdjud.com.br/clientes",
    sobretitulo: "Cadastro por leitura",
    titulo: "A IA le o documento e preenche o cadastro",
    texto:
      "Envie o RG, a CNH, o cartao CNPJ, o contrato social ou a procuracao. A inteligencia artificial devolve cada campo com a confianca que teve na leitura e diz onde achou aquilo no papel. Nada entra no sistema antes de alguem conferir e aprovar, campo a campo.",
    pontos: [
      "CPF e CNPJ conferidos pelo digito verificador, do nosso lado",
      "Numero de processo validado no padrao do CNJ",
      "O que a IA leu mal chega marcado, nao chega escondido",
    ],
  },
  {
    arquivo: "publicacoes",
    endereco: "seu-escritorio.birdjud.com.br/publicacoes",
    sobretitulo: "Publicacoes",
    titulo: "O DJEN chega lido, e ja preso ao processo",
    texto:
      "As OABs do escritorio sao consultadas todo dia. A publicacao chega com o prazo que o texto indica em destaque, presa ao processo que ja existe no sistema, e a IA resume o que aconteceu, o que fazer e o que merece atencao — em quatro linhas, nao em quatro paginas.",
    pontos: [
      "Prazo detectado no texto e marcado como alerta, para conferir nos autos",
      "O que e urgente sobe para o topo da lista",
      "Da publicacao para a minuta da manifestacao, no mesmo lugar",
    ],
  },
  {
    arquivo: "agenda",
    endereco: "seu-escritorio.birdjud.com.br/agenda",
    sobretitulo: "Agenda e tarefas",
    titulo: "Prazo, audiencia e tarefa no mesmo dia da tela",
    texto:
      "A agenda se le por dia, como o escritorio trabalha. Prazo, audiencia, reuniao e tarefa dividem a mesma lista, presos ao processo de origem, e o que acontece nas proximas 48 horas aparece no painel antes de qualquer outra coisa.",
    pontos: [
      "Aviso por e-mail e por WhatsApp de audiencia e de prazo",
      "Tarefa atribuida a quem vai fazer, com o processo junto",
      "Horario sempre em Brasilia, venha de onde vier",
    ],
  },
  {
    arquivo: "notas",
    endereco: "seu-escritorio.birdjud.com.br/notas",
    sobretitulo: "Nota fiscal",
    titulo: "NFS-e pelo padrao nacional, com o certificado do escritorio",
    texto:
      "A nota e assinada com o certificado A1 do proprio escritorio e enviada ao padrao nacional da NFS-e. O numero e reservado antes do envio, o retorno da prefeitura fica guardado, e o cancelamento so acontece depois que a prefeitura aceita.",
    pontos: [
      "Nota nasce da cobranca, sem redigitar valor nem cliente",
      "Chave de acesso e PDF guardados junto do cliente",
      "O que falhou diz por que falhou, em portugues",
    ],
  },
  {
    arquivo: "cobrancas",
    endereco: "seu-escritorio.birdjud.com.br/cobrancas",
    sobretitulo: "Cobrancas e financeiro",
    titulo: "Boleto e Pix na conta do proprio escritorio",
    texto:
      "A cobranca sai na conta do escritorio, nao na nossa: o dinheiro nao passa pela plataforma em momento algum. Quando o cliente paga, a baixa entra sozinha e vira receita no financeiro, uma vez so.",
    pontos: [
      "Boleto, Pix e cartao, com o link indo para o cliente",
      "Vencida aparece no painel enquanto nao for resolvida",
      "Cada escritorio com as proprias credenciais, guardadas cifradas",
    ],
  },
];

const RECURSOS: { icone: NomeDeIcone; titulo: string; texto: string }[] = [
  {
    icone: "ia",
    titulo: "Inteligencia artificial onde da trabalho",
    texto:
      "Leitura de documento para cadastro, resumo de publicacao e rascunho de manifestacao. O que a IA escreve e sempre rascunho: quem assina e quem responde pela peca.",
  },
  {
    icone: "publicacoes",
    titulo: "Publicacoes do DJEN",
    texto:
      "Captura diaria por OAB, com o prazo em destaque e o vinculo automatico ao processo. Sem OAB cadastrada o sistema avisa, em vez de ficar em silencio.",
  },
  {
    icone: "processos",
    titulo: "Clientes, processos e prazos",
    texto:
      "A ficha do processo junta publicacoes, agenda, arquivos e cobrancas em uma tela so. A busca acha pelo numero com ou sem mascara.",
  },
  {
    icone: "cobrancas",
    titulo: "Cobranca, nota fiscal e caixa",
    texto:
      "Boleto e Pix na conta do escritorio, NFS-e pelo padrao nacional e o financeiro fechando junto, sem lancar duas vezes.",
  },
  {
    icone: "arquivos",
    titulo: "Arquivos do escritorio",
    texto:
      "Documento guardado junto do cliente e do processo, com franquia por plano, tipo conferido e nome limpo antes de gravar.",
  },
  {
    icone: "conta",
    titulo: "Seu endereco, sua marca",
    texto:
      "Cada escritorio atende em seu proprio subdominio, com a logo e as cores dele. Os dados de um escritorio nao alcancam os de outro — isso nao depende de plano.",
  },
];

export function CapaDaPlataforma({
  dias,
  contato,
}: {
  dias: number;
  contato?: string;
}) {
  const faixaVitrine = FAIXAS_PUBLICADAS[0];

  return (
    <>
      <CabecalhoPublico />

      <main>
        <section className="faixa-escura overflow-hidden">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1fr_minmax(0,30rem)] lg:items-center">
            <div>
              <p className="sobretitulo">
                Gestao juridica com inteligencia artificial
              </p>
              <h1
                className="mt-4 max-w-3xl text-3xl leading-tight text-[color:var(--marca-contraste)] sm:text-5xl"
                style={{ fontFamily: "var(--fonte-titulo)" }}
              >
                Mais tempo para o que realmente importa.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-300">
                O BirdJud cuida do que consome o dia do escritorio — publicacao,
                prazo, cadastro, cobranca e nota — para que a advocacia volte a
                ser o trabalho principal. Seu escritorio, sua marca, seus dados
                isolados.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/cadastro"
                  className="botao font-semibold"
                  style={{
                    backgroundColor: "var(--marca-secundaria)",
                    color: "var(--marca-primaria)",
                  }}
                >
                  Criar o sistema do meu escritorio
                </Link>
                <Link
                  href="/planos"
                  className="botao border border-white/25 font-semibold text-[color:var(--marca-contraste)] hover:bg-white/10"
                >
                  Ver os planos
                </Link>
                <span className="text-sm text-slate-400">
                  {dias} dias de teste, sem cartao. A partir de{" "}
                  {emReais(
                    contaDoPlano("ESSENCIAL", faixaVitrine).totalCentavos,
                  )}{" "}
                  por mes.
                </span>
              </div>
            </div>

            {/* A primeira tela do sistema ja na capa: quem chega ve o produto
                antes de ler sobre ele. */}
            <div className="hidden lg:block">
              <Tela
                arquivo="painel"
                alt="O painel do dia no BirdJud, com agenda, publicacoes e cobrancas"
                endereco="seu-escritorio.birdjud.com.br"
                prioridade
              />
            </div>
          </div>
        </section>

        <section
          id="sistema"
          className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6"
        >
          <p className="sobretitulo">O sistema por dentro</p>
          <h2 className="mt-2 text-2xl sm:text-3xl">
            Estas sao telas do BirdJud, nao desenhos
          </h2>
          <p className="chamada max-w-3xl">
            As imagens abaixo sao capturas do sistema rodando, em um escritorio
            de demonstracao com dados inventados. Quando a tela muda, a imagem
            muda junto.
          </p>

          <div className="mt-12 grid gap-16">
            {DEMONSTRACOES.map((demonstracao, indice) => (
              <article
                key={demonstracao.arquivo}
                className="grid items-center gap-8 lg:grid-cols-2"
              >
                <div className={indice % 2 === 1 ? "lg:order-2" : ""}>
                  <p className="sobretitulo">{demonstracao.sobretitulo}</p>
                  <h3 className="mt-2 text-xl sm:text-2xl">
                    {demonstracao.titulo}
                  </h3>
                  <p className="mt-3 leading-relaxed text-slate-600">
                    {demonstracao.texto}
                  </p>
                  <ul className="mt-4 grid gap-2 text-sm text-slate-600">
                    {demonstracao.pontos.map((ponto) => (
                      <li key={ponto} className="flex gap-2">
                        <span className="destaque">✓</span>
                        <span>{ponto}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Tela
                  arquivo={demonstracao.arquivo}
                  alt={demonstracao.titulo}
                  endereco={demonstracao.endereco}
                />
              </article>
            ))}
          </div>
        </section>

        <section id="recursos" className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
            <p className="sobretitulo">Servicos</p>
            <h2 className="mt-2 text-2xl sm:text-3xl">
              Tudo que o escritorio usa no dia, em um lugar so
            </h2>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {RECURSOS.map((recurso) => (
                <article key={recurso.titulo} className="cartao">
                  <span className="destaque">
                    <Icone nome={recurso.icone} className="h-6 w-6" />
                  </span>
                  <h3 className="mt-3">{recurso.titulo}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                    {recurso.texto}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="sobretitulo">Planos</p>
          <h2 className="mt-2 text-2xl sm:text-3xl">
            Comeca em {rotuloDoTamanho(faixaVitrine)} e cresce com o escritorio
          </h2>
          <p className="chamada max-w-3xl">
            Quatro planos prontos, do mais simples ao mais completo, ou monte o
            seu, modulo a modulo. Acima de 25 advogados o preco sai de uma
            proposta.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLANOS.map((plano) => {
              const conta = contaDoPlano(plano, faixaVitrine);
              return (
                <Link
                  key={plano}
                  href="/planos"
                  className="cartao transition hover:border-slate-300"
                >
                  <h3>{PLANO[plano].rotulo}</h3>
                  <p className="mt-2 text-2xl font-bold tracking-tight">
                    {emReais(conta.totalCentavos)}
                    <span className="text-sm font-normal text-slate-500">
                      {" "}
                      /mes
                    </span>
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {PLANO[plano].chamada}
                  </p>
                </Link>
              );
            })}
          </div>

          <Link href="/planos" className="botao-secundario mt-6">
            Comparar os planos e montar o seu
          </Link>
        </section>

        <section id="quem-somos" className="border-t border-slate-200 bg-white">
          <div className="mx-auto grid max-w-6xl scroll-mt-24 gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_20rem]">
            <div>
              <p className="sobretitulo">Quem somos</p>
              <h2 className="mt-2 text-2xl sm:text-3xl">
                BirdJud, by Blackbird
              </h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                O BirdJud nasceu dentro de um escritorio de advocacia, da rotina
                de quem perde a manha conferindo publicacao, redigitando
                documento e correndo atras de prazo. Cada funcao do sistema
                existe porque alguem, em algum dia de trabalho, precisou dela —
                e nao porque ficava bem na lista de recursos.
              </p>
              <p className="mt-4 leading-relaxed text-slate-600">
                A Blackbird e a casa de tecnologia que constroi e mantem o
                sistema. Nosso compromisso e simples de enunciar e dificil de
                cumprir, e por isso esta escrito: os dados de um escritorio nao
                alcancam os de outro, o dinheiro do cliente nao passa pela
                plataforma, e o que a inteligencia artificial escreve e rascunho
                para conferencia humana — nunca peca pronta para protocolo.
              </p>
              <p className="mt-4 leading-relaxed text-slate-600">
                O isolamento entre escritorios nao depende de plano contratado
                nem de configuracao: e a base do sistema, verificada a cada
                mudanca por uma bateria de testes que precisa passar antes de
                qualquer publicacao.
              </p>
            </div>

            <aside className="cartao h-fit">
              <MarcaBirdJud forma="completa" largura={260} comLink={false} />
              <dl className="mt-5 grid gap-3 text-sm">
                <div>
                  <dt className="font-semibold">Onde os dados ficam</dt>
                  <dd className="text-slate-600">
                    Servidores no Brasil, com backup diario e retencao declarada
                    no acordo de LGPD.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">Quem le o que</dt>
                  <dd className="text-slate-600">
                    Cada escritorio ve apenas os proprios dados. Acesso de
                    suporte fica registrado.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">Se voce sair</dt>
                  <dd className="text-slate-600">
                    Exportacao completa dos seus dados, e purga depois do prazo
                    de retencao.
                  </dd>
                </div>
              </dl>
            </aside>
          </div>
        </section>

        <section
          id="contato"
          className="scroll-mt-24 border-t border-slate-200"
        >
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <p className="sobretitulo">Contato</p>
            <h2 className="mt-2 text-2xl sm:text-3xl">
              Fale com quem construiu
            </h2>
            <p className="chamada max-w-3xl">
              Duvida sobre plano, migracao do sistema atual ou escritorio acima
              de 25 advogados: escreva. Quem responde conhece o produto por
              dentro.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-4">
              {contato ? (
                <a href={`mailto:${contato}`} className="botao-principal">
                  Escrever para {contato}
                </a>
              ) : null}
              <Link href="/cadastro" className="botao-secundario">
                Comecar o teste de {dias} dias
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="faixa-escura">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <MarcaBirdJud fundo="escuro" largura={120} comLink={false} />
            <p className="mt-3 text-sm text-slate-400">
              BirdJud <span className="destaque">·</span> by Blackbird
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300">
            <Link href="/planos" className="hover:text-white">
              Planos
            </Link>
            <Link href="/#recursos" className="hover:text-white">
              Servicos
            </Link>
            <Link href="/#quem-somos" className="hover:text-white">
              Quem somos
            </Link>
            <Link href="/juridico/TERMOS-DE-USO" className="hover:text-white">
              Termos de uso
            </Link>
            <Link href="/juridico/CONTRATO-SAAS" className="hover:text-white">
              Contrato
            </Link>
            <Link href="/juridico/ACORDO-LGPD" className="hover:text-white">
              Acordo de LGPD
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
