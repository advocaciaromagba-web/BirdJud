import Link from "next/link";
import { escritorioDoEndereco } from "@/lib/sessao";
import { DIAS_DE_TESTE } from "@/lib/precos";
import { MarcaBirdJud } from "@/componentes/MarcaBirdJud";
import { SimuladorDePlanos } from "@/componentes/SimuladorDePlanos";

export const metadata = {
  title: "Planos — BirdJud",
  description:
    "Planos do Essencial ao Completo, ou monte o seu: o escritorio leva so os modulos que usa.",
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
          Este endereco pertence a {marca.nome}. O plano contratado aparece em
          Minha conta.
        </p>
        <Link href="/conta" className="botao-secundario mt-4">
          Ir para Minha conta
        </Link>
      </main>
    );
  }

  return (
    <main className="pagina">
      <MarcaBirdJud />

      <div className="mt-8 max-w-2xl">
        <p className="sobretitulo">Planos</p>
        <h1 className="regua-destaque mt-2 text-3xl">
          Do escritorio organizado ao escritorio inteiro
        </h1>
        <p className="chamada mt-4">
          Quatro planos prontos, do mais simples ao mais completo — ou monte o
          seu, modulo a modulo. {DIAS_DE_TESTE} dias de teste, sem cartao.
        </p>
      </div>

      <div className="mt-10">
        <SimuladorDePlanos />
      </div>

      <section className="mt-14 max-w-3xl">
        <h2>O que vale para todos os planos</h2>
        <ul className="mt-3 grid gap-2 text-sm leading-relaxed text-slate-600">
          <li className="filete-destaque pl-4">
            O endereco e a marca sao do escritorio:{" "}
            <code>seu-escritorio.birdjud.com.br</code>, com a logo e as cores
            dele.
          </li>
          <li className="filete-destaque pl-4">
            Os dados de um escritorio nao alcancam os de outro. Isso nao depende
            de plano.
          </li>
          <li className="filete-destaque pl-4">
            O preco muda com o tamanho do escritorio, contado em advogados e em
            equipe de apoio ativos. Desativar alguem libera a vaga.
          </li>
          <li className="filete-destaque pl-4">
            Consumo que passa da franquia — mensagem de WhatsApp, nota emitida,
            token de IA, armazenamento — e cobrado pelo que foi usado, no mes
            seguinte.
          </li>
          <li className="filete-destaque pl-4">
            Trocar de plano nao refaz contrato assinado: o valor combinado fica
            gravado na assinatura do escritorio.
          </li>
        </ul>
      </section>

      <footer className="mt-14 border-t border-slate-200 pt-8 text-sm text-slate-500">
        <p>
          Os valores desta pagina sao a tabela vigente da plataforma. BirdJud{" "}
          <span className="destaque">·</span> by Blackbird
        </p>
      </footer>
    </main>
  );
}
