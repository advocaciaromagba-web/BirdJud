import { escritorioDoEndereco } from "@/lib/sessao";
import { DIAS_DE_TESTE } from "@/lib/precos";
import { FormularioCadastro } from "@/componentes/FormularioCadastro";
import { CabecalhoPublico } from "@/componentes/CabecalhoPublico";
import { MODULOS, FAIXAS_PUBLICADAS, type Modulo } from "@/lib/catalogo";
import { contaMontada, modulosDoPlano } from "@/lib/planos";
import { dominioDaPlataforma } from "@/lib/dominio";

export default async function PaginaCadastro({
  searchParams,
}: {
  searchParams: Promise<{ modulos?: string }>;
}) {
  // De dentro do subdominio de um escritorio nao se cria outro escritorio.
  const marca = await escritorioDoEndereco();
  if (marca?.id) {
    return (
      <main className="pagina-estreita">
        <h1>Cadastro</h1>
        <p className="chamada">
          Este endereco pertence a {marca.nome}. O cadastro de escritorios novos
          e feito no endereco da plataforma.
        </p>
      </main>
    );
  }

  const dominio = dominioDaPlataforma();

  // A escolha feita na pagina de planos chega pelo endereco. Sem ela, o teste
  // comeca com o plano Completo — e o formulario diz isso.
  const pedidos = (await searchParams).modulos;
  const escolhidos =
    pedidos === undefined
      ? modulosDoPlano("COMPLETO")
      : pedidos
          .split(",")
          .map((parte) => parte.trim())
          .filter((parte): parte is Modulo =>
            (MODULOS as readonly string[]).includes(parte),
          );
  // Todo escritorio novo entra na faixa de entrada; a conta da tela e a dela.
  const conta = contaMontada(escolhidos, FAIXAS_PUBLICADAS[0]);

  return (
    <>
      <CabecalhoPublico />
      <main className="pagina-estreita">
        <h1 className="regua-destaque text-3xl">
          Criar o sistema do seu escritorio
        </h1>
        <p className="chamada mt-4">
          Seu escritorio, sua marca, seus dados isolados. {DIAS_DE_TESTE} dias
          de teste, sem cartao.
        </p>
        <FormularioCadastro
          dominio={dominio}
          dias={DIAS_DE_TESTE}
          modulos={conta.modulos.map((linha) => linha.modulo)}
          plano={conta.plano}
          mensalidadeCentavos={conta.totalCentavos}
        />
      </main>
    </>
  );
}
