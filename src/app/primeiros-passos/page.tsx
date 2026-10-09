import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { Estrutura } from "@/componentes/Estrutura";
import { roteiroDoEscritorio } from "@/lib/primeiros-passos-do-escritorio";
import { FASES } from "@/lib/primeiros-passos";
import {
  BarraDeProgresso,
  RoteiroDePrimeirosPassos,
} from "@/componentes/RoteiroDePrimeirosPassos";
import { MostrarNoInicio } from "@/componentes/MostrarNoInicio";

export const dynamic = "force-dynamic";

export default async function PaginaPrimeirosPassos() {
  const contexto = await contextoDaPagina();
  const modulos = await modulosAtivos(contexto.escritorioId);
  const estrutura = {
    nomeEscritorio: contexto.marca.nome,
    logoUrl: contexto.marca.logoUrl,
    papel: contexto.papel,
    nomeUsuario: contexto.nomeUsuario,
    acesso: contexto.acesso,
    modulos,
    titulo: "Primeiros passos",
  };

  if (contexto.papel !== "ADMIN") {
    return (
      <Estrutura {...estrutura}>
        <p className="mt-4 leitura text-slate-600">
          A configuracao do escritorio e feita pelo administrador. Se algo
          estiver faltando para o seu trabalho, fale com quem administra o
          sistema no escritorio.
        </p>
      </Estrutura>
    );
  }

  const roteiro = await roteiroDoEscritorio(contexto.escritorioId);

  return (
    <Estrutura
      {...estrutura}
      chamada="O caminho para o escritorio funcionar sozinho. Cada passo se marca quando estiver feito de verdade."
    >
      <section className="cartao mt-2">
        {roteiro.completo ? (
          <>
            <h2 className="text-lg font-bold">Configuracao concluida</h2>
            <p className="mt-1 text-slate-600">
              O que o plano do escritorio pede esta feito ou foi deixado para
              depois. Os passos continuam abaixo para revisar quando quiser.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold">
              {roteiro.essenciaisFeitos
                ? "O essencial esta pronto. Agora, as conexoes."
                : "Comece pelo essencial: tres passos, menos de dez minutos."}
            </h2>
            <p className="mt-1 text-slate-600">
              Nao precisa ser tudo hoje. O roteiro guarda onde voce parou, e o
              que nao fizer sentido para o escritorio pode ser deixado para
              depois.
            </p>
          </>
        )}
        <div className="mt-4">
          <BarraDeProgresso
            porcento={roteiro.porcento}
            rotulo={`${roteiro.feitos} de ${roteiro.total} passos · ${roteiro.porcento}%${
              roteiro.minutosRestantes ? ` · cerca de ${roteiro.minutosRestantes} min no que falta` : ""
            }`}
          />
        </div>
        <MostrarNoInicio dispensado={roteiro.dispensado} />
      </section>

      <RoteiroDePrimeirosPassos
        fases={FASES.map((f) => ({ chave: f.chave, titulo: f.titulo, resumo: f.resumo }))}
        passos={roteiro.passos}
        proximo={roteiro.proximo?.chave ?? null}
      />
    </Estrutura>
  );
}
