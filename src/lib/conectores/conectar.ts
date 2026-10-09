// Conectar uma integracao por formulario: confere os campos, testa no servico
// de verdade e guarda — com o veredito junto. Usado pela tela de Integracoes
// do escritorio e pela implantacao feita pela plataforma.
import { moduloAtivo } from "../modulos";
import { salvarIntegracao, type TipoIntegracao } from "../integracao";
import { CONECTORES } from "./index";

export class ConexaoRecusada extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem);
    this.name = "ConexaoRecusada";
  }
}

export async function conectarPorFormulario(
  escritorioId: string,
  tipo: TipoIntegracao,
  dados: Record<string, string>,
): Promise<{ ok: boolean; detalhe: string }> {
  const conector = CONECTORES[tipo];
  if (!conector) throw new ConexaoRecusada("Esta integracao nao e mais configurada pelo escritorio.", 404);
  if (conector.modulo && !(await moduloAtivo(escritorioId, conector.modulo))) {
    throw new ConexaoRecusada(`O modulo ${conector.modulo} nao esta contratado.`, 403);
  }
  if (conector.oauth) {
    throw new ConexaoRecusada(
      `O ${conector.rotulo} se conecta pelo botao, entrando na conta do escritorio.`,
      400,
    );
  }
  const faltando = conector.campos
    .filter((campo) => campo.obrigatorio && !dados[campo.nome]?.trim())
    .map((campo) => campo.rotulo);
  if (faltando.length > 0) {
    throw new ConexaoRecusada(`Faltou preencher: ${faltando.join(", ")}.`, 400);
  }

  // Testa antes de guardar e grava o veredito junto. A credencial fica mesmo
  // quando o teste falha: corrige-se o que faltou sem digitar tudo de novo.
  const resultado = await conector.testar(dados, { escritorioId });
  await salvarIntegracao(
    escritorioId,
    conector.tipo,
    dados,
    resultado.ok ? "OK" : "ERRO",
    resultado.ok ? null : resultado.detalhe,
  );
  return resultado;
}
