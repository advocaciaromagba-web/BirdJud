// Modulo NFSE: emissao de nota de servico pelo escritorio.
//
// A divisao aqui e deliberada, e existe porque NFS-e no Brasil nao e um
// padrao so:
//
//   layout.ts     — como o XML do padrao NACIONAL e montado   (incerto ate a homologacao)
//   nacional.ts   — como ele viaja ate o ambiente nacional     (incerto ate a homologacao)
//   assinatura.ts — como ele e assinado                        (provado em teste)
//   este arquivo  — o que o escritorio ve: numero, status, erro, cancelamento
//
// Municipio com padrao proprio (ABRASF e as variantes) entra trocando os dois
// primeiros, sem tocar em banco, tela ou fila.
import { comEscritorio, semEscritorio } from "../prisma";
import { obterIntegracao, IntegracaoAusente } from "../integracao";
import { registrarConsumo } from "../consumo";
import { abrirCertificado, assinarDps, assinarEvento, CertificadoInvalido } from "./assinatura";
import { cancelar as cancelarNoNacional, emitir as enviarAoNacional, FalhaNaNfse } from "./nacional";
import {
  idDaDps,
  montarDps,
  montarPedidoDeCancelamento,
  type Ambiente,
  type DadosDaDps,
  type MotivoDeCancelamento,
  type Regime,
} from "./layout";

export { FalhaNaNfse } from "./nacional";
export { CertificadoInvalido } from "./assinatura";

export class SemCadastroFiscal extends Error {
  readonly status = 428;
  constructor() {
    super(
      "Cadastro fiscal incompleto: CNPJ, inscricao municipal, municipio, regime, codigo do servico e aliquota precisam estar preenchidos em Integracoes."
    );
    this.name = "SemCadastroFiscal";
  }
}

export class SemCertificado extends Error {
  readonly status = 503;
  constructor() {
    super("O escritorio ainda nao enviou o certificado e-CNPJ em Integracoes.");
    this.name = "SemCertificado";
  }
}

export class NotaInvalida extends Error {
  readonly status = 400;
  constructor(motivo: string) {
    super(motivo);
    this.name = "NotaInvalida";
  }
}

export type PedidoDeNota = {
  clienteId: string;
  cobrancaId?: string | null;
  descricao: string;
  valorCentavos: number;
};

type CredencialCertificado = { arquivo: string; senha: string };

/**
 * Emite a nota.
 *
 * A ordem e: reservar o numero no nosso banco, montar, assinar, mandar. O
 * numero e reservado antes porque numeracao de nota nao pode ter buraco nem
 * repeticao — se o envio falhar, a nota fica RECUSADA com aquele numero e o
 * motivo, e o proximo pedido usa o numero seguinte. Nota recusada com numero
 * gasto e o que o contador espera ver; numero repetido, nao.
 */
export async function emitirNota(
  escritorioId: string,
  pedido: PedidoDeNota
): Promise<{ id: string; status: string; chaveAcesso: string | null }> {
  if (pedido.valorCentavos <= 0) throw new NotaInvalida("O valor precisa ser maior que zero.");
  if (!pedido.descricao.trim()) throw new NotaInvalida("A nota precisa da descricao do servico.");

  const fiscal = await comEscritorio(escritorioId, (db) => db.fiscal.findFirst());
  if (!fiscal) throw new SemCadastroFiscal();

  const cliente = await comEscritorio(escritorioId, (db) =>
    db.cliente.findUnique({ where: { id: pedido.clienteId } })
  );
  if (!cliente) throw new NotaInvalida("Cliente nao encontrado.");
  if (!cliente.documento) {
    throw new NotaInvalida(`${cliente.nome} esta sem CPF/CNPJ, e a nota exige o documento.`);
  }

  let credencial: CredencialCertificado;
  try {
    credencial = await obterIntegracao<CredencialCertificado>(escritorioId, "NFSE_CERT");
  } catch (erro) {
    if (erro instanceof IntegracaoAusente) throw new SemCertificado();
    throw erro;
  }

  // Numero reservado dentro da transacao: duas emissoes ao mesmo tempo nao
  // levam o mesmo numero.
  const { nota, numero } = await comEscritorio(escritorioId, async (db) => {
    const atual = await db.fiscal.update({
      where: { id: fiscal.id },
      data: { proximoNumero: { increment: 1 } },
    });
    const numero = atual.proximoNumero - 1;
    const nota = await db.notaFiscal.create({
      data: semEscritorio({
        clienteId: pedido.clienteId,
        cobrancaId: pedido.cobrancaId ?? null,
        serie: atual.serie,
        numero,
        descricao: pedido.descricao,
        valorCentavos: pedido.valorCentavos,
      }),
    });
    return { nota, numero };
  });

  const dados: DadosDaDps = {
    serie: fiscal.serie,
    numero,
    emitidaEm: new Date(),
    prestador: {
      cnpj: fiscal.cnpj,
      inscricaoMunicipal: fiscal.inscricaoMunicipal,
      codigoMunicipio: fiscal.codigoMunicipio,
      regime: fiscal.regime as Regime,
    },
    tomador: {
      documento: cliente.documento,
      nome: cliente.nome,
      email: cliente.email,
    },
    servico: {
      codigoTributacao: fiscal.codigoTributacao,
      descricao: pedido.descricao,
      valorCentavos: pedido.valorCentavos,
      aliquotaMilesimos: fiscal.aliquotaMilesimos,
      issRetido: false,
      codigoMunicipioPrestacao: fiscal.codigoMunicipio,
    },
  };

  const ambiente = fiscal.ambiente as Ambiente;

  try {
    const certificado = abrirCertificado(credencial.arquivo, credencial.senha);
    const assinado = assinarDps(montarDps(dados, ambiente), certificado, idDaDps(dados));
    const retorno = await enviarAoNacional(assinado, ambiente);

    await comEscritorio(escritorioId, (db) =>
      db.notaFiscal.update({
        where: { id: nota.id },
        data: {
          status: "EMITIDA",
          chaveAcesso: retorno.chaveAcesso,
          numeroNaPrefeitura: retorno.numero,
          linkPdf: retorno.linkPdf,
          xmlEnviado: assinado,
          xmlRetorno: retorno.xml,
          emitidaEm: new Date(),
          erro: null,
        },
      })
    );
    await registrarConsumo(escritorioId, "NFSE_EMITIDA", 1);
    return { id: nota.id, status: "EMITIDA", chaveAcesso: retorno.chaveAcesso };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "falha desconhecida";
    await comEscritorio(escritorioId, (db) =>
      db.notaFiscal.update({
        where: { id: nota.id },
        data: { status: "RECUSADA", erro: motivo.slice(0, 1000) },
      })
    );

    throw erro;
  }
}

export class CancelamentoInvalido extends Error {
  readonly status = 409;
  constructor(motivo: string) {
    super(motivo);
    this.name = "CancelamentoInvalido";
  }
}

/**
 * Cancela a nota na prefeitura e so entao marca aqui.
 *
 * A ordem inversa (marcar antes) deixaria o escritorio achando que cancelou
 * uma nota que continua valendo — e ISS a pagar sobre servico que nao houve.
 *
 * Prazo e regra de cancelamento sao municipais e mudam: quem diz "nao" e o
 * ambiente nacional, e a resposta dele chega inteira ate a tela. Inventar
 * regra de prazo aqui daria um "nao" nosso onde a prefeitura diria "sim".
 */
export async function cancelarNota(
  escritorioId: string,
  id: string,
  motivo: MotivoDeCancelamento = "ERRO_NA_EMISSAO"
): Promise<void> {
  const nota = await comEscritorio(escritorioId, (db) =>
    db.notaFiscal.findUnique({ where: { id } })
  );
  if (!nota) throw new NotaInvalida("Nota nao encontrada.");
  if (nota.status === "CANCELADA") return;
  if (nota.status !== "EMITIDA" || !nota.chaveAcesso) {
    throw new CancelamentoInvalido("So nota emitida pode ser cancelada.");
  }

  const fiscal = await comEscritorio(escritorioId, (db) => db.fiscal.findFirst());
  if (!fiscal) throw new SemCadastroFiscal();

  let credencial: CredencialCertificado;
  try {
    credencial = await obterIntegracao<CredencialCertificado>(escritorioId, "NFSE_CERT");
  } catch (erro) {
    if (erro instanceof IntegracaoAusente) throw new SemCertificado();
    throw erro;
  }

  const ambiente = fiscal.ambiente as Ambiente;
  const certificado = abrirCertificado(credencial.arquivo, credencial.senha);
  const pedido = montarPedidoDeCancelamento({
    chaveAcesso: nota.chaveAcesso,
    cnpjAutor: fiscal.cnpj,
    motivo,
    emitidoEm: new Date(),
    ambiente,
  });

  await cancelarNoNacional(
    nota.chaveAcesso,
    assinarEvento(pedido.xml, certificado, pedido.id),
    ambiente
  );

  await comEscritorio(escritorioId, (db) =>
    db.notaFiscal.update({
      where: { id },
      data: { status: "CANCELADA", canceladaEm: new Date(), erro: null },
    })
  );
}
