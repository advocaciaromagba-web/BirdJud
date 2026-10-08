import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { dataHoraBR } from "@/lib/datas";
import { CAMPOS, NOME_DA_ESPECIE } from "@/lib/modelos";
import { modelosVigentes } from "@/lib/modelos-do-escritorio";
import { Estrutura } from "@/componentes/Estrutura";
import { PainelModelos, type ModeloNaTela } from "@/componentes/PainelModelos";

export default async function PaginaModelos() {
  const contexto = await contextoDaPagina(undefined, "MODELOS");
  const modulos = await modulosAtivos(contexto.escritorioId);
  const vigentes = await modelosVigentes(contexto.escritorioId);

  const naTela: ModeloNaTela[] = vigentes.map((m) => ({
    especie: m.especie,
    nome: NOME_DA_ESPECIE[m.especie],
    doEscritorio: m.doEscritorio,
    nomeDoArquivo: m.nomeDoArquivo,
    usados: m.usados,
    desconhecidos: m.desconhecidos,
    enviadoEmBR: m.enviadoEm ? dataHoraBR.format(m.enviadoEm) : null,
  }));

  const proprios = naTela.filter((m) => m.doEscritorio).length;

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      nomeUsuario={contexto.nomeUsuario}
      acesso={contexto.acesso}
      modulos={modulos}
      titulo="Modelos de documento"
      chamada={
        proprios === 0
          ? "Usando os modelos que ja vem no sistema."
          : `${proprios} de ${naTela.length} no papel do escritorio.`
      }
    >
      <PainelModelos
        modelos={naTela}
        campos={[...CAMPOS]}
        podeTrocar={contexto.papel === "ADMIN"}
      />
    </Estrutura>
  );
}
