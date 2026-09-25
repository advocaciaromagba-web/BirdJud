import Link from "next/link";
import { MarcaBirdJud } from "./MarcaBirdJud";
import { Icone, type NomeDeIcone } from "./Icone";

const O_QUE_FAZ: { icone: NomeDeIcone; titulo: string; texto: string }[] = [
  {
    icone: "publicacoes",
    titulo: "Publicacoes do DJEN",
    texto:
      "As OABs do escritorio sao consultadas todo dia. A publicacao chega ja presa ao processo, com o prazo que o texto indica em destaque.",
  },
  {
    icone: "ia",
    titulo: "Inteligencia artificial no lugar certo",
    texto:
      "Le o documento e preenche o cadastro, resume a publicacao e rascunha a manifestacao. Nada entra no sistema sem alguem conferir.",
  },
  {
    icone: "agenda",
    titulo: "Agenda, prazos e processos",
    texto:
      "Prazo, audiencia e compromisso em um painel so, com o que pede acao nas proximas 48 horas na frente.",
  },
  {
    icone: "cobrancas",
    titulo: "Cobranca, nota fiscal e financeiro",
    texto:
      "Boleto e Pix na conta do proprio escritorio, NFS-e pelo padrao nacional e o caixa fechando junto.",
  },
  {
    icone: "arquivos",
    titulo: "Arquivos do escritorio",
    texto:
      "Documento guardado junto do cliente e do processo, com franquia por plano e sem depender de nuvem de terceiro.",
  },
  {
    icone: "conta",
    titulo: "Seu endereco, sua marca",
    texto:
      "Cada escritorio atende em seu proprio subdominio, com a logo e as cores dele. Os dados de um escritorio nao alcancam os de outro.",
  },
];

/** A capa de quem chega pelo endereco da plataforma, sem escritorio no caminho. */
export function CapaDaPlataforma({ dias }: { dias: number }) {
  return (
    <main>
      <section className="faixa-escura">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
          <MarcaBirdJud fundo="escuro" largura={150} comLink={false} />

          <h1
            className="mt-10 max-w-2xl text-3xl leading-tight text-[color:var(--marca-contraste)] sm:text-5xl"
            style={{ fontFamily: "var(--fonte-titulo)" }}
          >
            Mais tempo para o que realmente importa.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-300">
            Gestao completa para escritorios de advocacia, com inteligencia
            artificial. Seu escritorio, sua marca, seus dados isolados.
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
              {dias} dias de teste, sem cartao.
            </span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-14">
        <p className="sobretitulo">O que o sistema faz</p>
        <h2 className="mt-2 text-2xl">
          Tudo que o escritorio usa no dia, em um lugar so
        </h2>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {O_QUE_FAZ.map((item) => (
            <article key={item.titulo} className="cartao">
              <span className="destaque">
                <Icone nome={item.icone} className="h-6 w-6" />
              </span>
              <h3 className="mt-3">{item.titulo}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                {item.texto}
              </p>
            </article>
          ))}
        </div>

        <p className="ajuda mt-8 max-w-2xl">
          Cada escritorio contrata so os modulos que usa, e paga pela faixa de
          advogados. O que a inteligencia artificial escreve e sempre rascunho:
          quem assina e quem responde pela peca.
        </p>
      </section>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-8 text-sm text-slate-500">
          <span>
            BirdJud <span className="destaque">·</span> by Blackbird
          </span>
          <Link href="/planos" className="hover:text-slate-900">
            Planos
          </Link>
          <Link href="/juridico/TERMOS-DE-USO" className="hover:text-slate-900">
            Termos de uso
          </Link>
          <Link href="/juridico/CONTRATO-SAAS" className="hover:text-slate-900">
            Contrato
          </Link>
          <Link href="/juridico/ACORDO-LGPD" className="hover:text-slate-900">
            Acordo de LGPD
          </Link>
        </div>
      </footer>
    </main>
  );
}
