import Link from "next/link";
import { escritorioDoEndereco } from "@/lib/sessao";
import { DIAS_DE_TESTE } from "@/lib/precos";
import { CabecalhoPublico } from "@/componentes/CabecalhoPublico";
import { SimuladorDePlanos } from "@/componentes/SimuladorDePlanos";

export const metadata = {
  title: "Planos — BirdJud",
  description:
    "Planos do Essencial ao Completo, ou monte o seu: o escritório leva só os módulos que usa.",
};

export default async function PaginaPlanos() {
  // Dentro do subdominio de um escritorio, plano e assunto da conta dele, nao
  // vitrine: quem entra ali ja e cliente.
  const marca = await escritorioDoEndereco();
  if (marca?.id) {
    return (
      <main className="pagina-estreita">
        <h1>Planos</h1>
        <p className="chamada">
          Este endereço pertence a {marca.nome}. O plano contratado aparece em
          Minha conta.
        </p>
        <Link href="/conta" className="botao-secundario mt-4">
          Ir para Minha conta
        </Link>
      </main>
    );
  }

  return (
    <>
      <CabecalhoPublico />
      <main className="pagina">
        <div className="max-w-2xl">
          <p className="sobretitulo">Planos</p>
          <h1 className="regua-destaque mt-2 text-3xl">
            Do escritório organizado ao escritório inteiro
          </h1>
          <p className="chamada mt-4">
            Quatro planos prontos, do mais simples ao mais completo — ou monte o
            seu, módulo a módulo. {DIAS_DE_TESTE} dias de teste, sem cartão.
          </p>
        </div>

        <div className="mt-10">
          <SimuladorDePlanos contato={process.env.CONTATO_COMERCIAL} />
        </div>

        <section className="mt-14 max-w-3xl">
          <h2>O que vale para todos os planos</h2>
          <ul className="mt-3 grid gap-2 text-sm leading-relaxed text-slate-600">
            <li className="filete-destaque pl-4">
              O endereço e a marca são do escritório:{" "}
              <code>seu-escritório.birdjud.com.br</code>, com a logo e as cores
              dele.
            </li>
            <li className="filete-destaque pl-4">
              Os dados de um escritório não alcançam os de outro. Isso não
              depende de plano.
            </li>
            <li className="filete-destaque pl-4">
              O preço muda com o tamanho do escritório, contado em advogados e
              em equipe de apoio ativos. Desativar alguém libera a vaga.
            </li>
            <li className="filete-destaque pl-4">
              Acima de 25 advogados o preço sai de uma proposta. Escritório
              desse tamanho tem migração de sistema, volume próprio de uso e
              franquia ajustada — coisas que tabela de vitrine não resolve bem.
            </li>
            <li className="filete-destaque pl-4">
              Consumo que passa da franquia — mensagem de WhatsApp, nota
              emitida, token de IA, armazenamento — é cobrado pelo que foi
              usado, no mês seguinte.
            </li>
            <li className="filete-destaque pl-4">
              Trocar de plano não refaz contrato assinado: o valor combinado
              fica gravado na assinatura do escritório.
            </li>
          </ul>
        </section>

        <footer className="mt-14 border-t border-slate-200 pt-8 text-sm text-slate-500">
          <p>
            Os valores desta página são a tabela vigente da plataforma. BirdJud{" "}
            <span className="destaque">·</span> by Blackbird
          </p>
        </footer>
      </main>
    </>
  );
}
