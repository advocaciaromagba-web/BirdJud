import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { dataHoraBR } from "@/lib/datas";
import {
  ROTULO_DA_SITUACAO,
  ROTULO_DA_URGENCIA,
  type Situacao,
  type Urgencia,
} from "@/lib/entrevista";
import { entrevistasDoEscritorio } from "@/lib/entrevista-do-escritorio";
import { Estrutura } from "@/componentes/Estrutura";
import { PainelEntrevistas } from "@/componentes/PainelEntrevistas";

export default async function PaginaEntrevistas() {
  const contexto = await contextoDaPagina(undefined, "ENTREVISTAS");
  const modulos = await modulosAtivos(contexto.escritorioId);
  const lista = await entrevistasDoEscritorio(contexto.escritorioId);

  const naTela = lista.map((e) => ({
    id: e.id,
    nome: e.nome,
    assunto: e.assunto,
    telefone: e.telefone,
    situacao: e.situacao as Situacao,
    rotuloDaSituacao: ROTULO_DA_SITUACAO[e.situacao as Situacao] ?? e.situacao,
    urgencia: (e.urgencia as Urgencia | null) ?? null,
    rotuloDaUrgencia: e.urgencia
      ? (ROTULO_DA_URGENCIA[e.urgencia as Urgencia] ?? e.urgencia)
      : null,
    temCliente: Boolean(e.clienteId),
    roteiro: Array.isArray(e.roteiro) ? (e.roteiro as string[]) : [],
    transcricao: e.transcricao ?? "",
    analise: (e.analise as Record<string, unknown> | null) ?? null,
    criadaEmBR: dataHoraBR.format(e.criadaEm),
  }));

  const semOrganizar = naTela.filter((e) => e.situacao === "ANOTADA").length;

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      nomeUsuario={contexto.nomeUsuario}
      acesso={contexto.acesso}
      modulos={modulos}
      titulo="Entrevistas"
      chamada={
        naTela.length === 0
          ? "A primeira conversa com quem procura o escritorio, virando documento."
          : semOrganizar > 0
            ? `${naTela.length} entrevista(s) · ${semOrganizar} anotada(s) esperando ser organizada(s).`
            : `${naTela.length} entrevista(s).`
      }
    >
      <PainelEntrevistas
        entrevistas={naTela}
        temIA={modulos.includes("IA")}
      />
    </Estrutura>
  );
}
