// Testar o WhatsApp em Configuracoes (03/11/2026, vindo do sistema da
// Advocacia Roma).
//
// POR QUE NAO E SO "MANDAR E VER SE DEU CERTO": a Meta responde "aceito" na
// hora e so conta o destino depois, pelo webhook. Na Roma, dias de mensagem
// nao entregue (pendencia de pagamento na conta da Meta) ficaram escondidos
// atras desse "aceito". O teste so diz que funciona quando a Meta confirma
// ENTREGUE.
//
// O teste e um aviso de tipo proprio: o webhook de status ja grava entrega e
// falha no aviso pelo id da Meta, e a entrega (entrega-do-escritorio.ts) deixa
// esse tipo fora do reenvio e dos alertas.
//
// O destino e sempre o celular de QUEM CLICOU, do cadastro dela: e diagnostico
// do canal, nao um jeito de disparar mensagem a cliente — e cada envio custa.
import { comEscritorio, semEscritorio } from "./prisma";
import { moduloAtivo } from "./modulos";
import { FalhaNoWhatsapp, enviarModelo, paraE164BR } from "./whatsapp";
import { MODELOS } from "./modelos-whatsapp";
import { TIPO_DO_TESTE } from "./entrega-do-escritorio";
import { PedidoInvalido } from "./cobrancas";

/** Sem retorno da Meta neste tempo, e sintoma: em geral o webhook de status. */
export const MINUTOS_SEM_RESPOSTA = 5;

export type SituacaoDoTeste = "AGUARDANDO" | "ENTREGUE" | "FALHOU" | "SEM_RESPOSTA";
export type Teste = { situacao: SituacaoDoTeste; telefone: string; enviadoEm: Date; entregueEm: Date | null; erro: string | null };

const mascarar = (telefone: string) => `(${telefone.slice(2, 4)}) •••••-${telefone.slice(-4)}`;

export async function enviarTeste(escritorioId: string, usuarioId: string): Promise<Teste> {
  if (!(await moduloAtivo(escritorioId, "WHATSAPP"))) throw new PedidoInvalido("O módulo de WhatsApp não está contratado.");
  const [usuario, escritorio] = await comEscritorio(escritorioId, (db) =>
    Promise.all([
      db.usuario.findFirst({ where: { id: usuarioId }, select: { telefone: true } }),
      db.escritorio.findFirstOrThrow({ where: { id: escritorioId }, select: { nome: true, telefoneAtendimento: true } }),
    ]),
  );
  const telefone = paraE164BR(usuario?.telefone);
  if (!telefone) throw new PedidoInvalido("Seu cadastro está sem celular. Preencha em Minha conta: o teste vai para o seu próprio WhatsApp.");

  const modelo = MODELOS.RESUMO_DO_DIA;
  const parametros = [escritorio.nome, "um teste do canal de WhatsApp, pedido em Configurações.", escritorio.telefoneAtendimento?.trim() || "o telefone do escritório"];
  const agora = new Date();
  const base = {
    canal: "WHATSAPP",
    tipo: TIPO_DO_TESTE,
    chave: `teste-whatsapp:${usuarioId}:${agora.getTime()}`,
    destino: telefone,
    assunto: "Teste do WhatsApp",
    corpo: "Mensagem de teste do canal, pedida em Configurações.",
    modelo: modelo.nome,
    usuarioId,
    enviadoPorId: usuarioId,
  };
  try {
    const r = await enviarModelo({ para: telefone, modelo: modelo.nome, idioma: modelo.idioma, parametros });
    await comEscritorio(escritorioId, (db) =>
      db.aviso.create({ data: semEscritorio({ ...base, estado: "ENVIADO", enviadoEm: agora, idNaMeta: r.idNaMeta, tentativas: 1 }) }),
    );
  } catch (erro) {
    const motivo = erro instanceof FalhaNoWhatsapp ? erro.message : (erro as Error).message;
    await comEscritorio(escritorioId, (db) =>
      db.aviso.create({ data: semEscritorio({ ...base, estado: "FALHOU", falhouEm: agora, erro: motivo.slice(0, 500), tentativas: 1 }) }),
    );
  }
  return (await lerTeste(escritorioId, usuarioId))!;
}

/** O ultimo teste desta pessoa, com "aguardando" virando "sem resposta" passado o tempo. */
export async function lerTeste(escritorioId: string, usuarioId: string, agora = new Date()): Promise<Teste | null> {
  const a = await comEscritorio(escritorioId, (db) =>
    db.aviso.findFirst({ where: { tipo: TIPO_DO_TESTE, usuarioId }, orderBy: { criadoEm: "desc" } }),
  );
  if (!a) return null;
  const enviadoEm = a.enviadoEm ?? a.criadoEm;
  let situacao: SituacaoDoTeste = "AGUARDANDO";
  if (a.entregueEm) situacao = "ENTREGUE";
  else if (a.estado === "FALHOU") situacao = "FALHOU";
  else if (agora.getTime() - enviadoEm.getTime() > MINUTOS_SEM_RESPOSTA * 60_000) situacao = "SEM_RESPOSTA";
  return { situacao, telefone: mascarar(a.destino), enviadoEm, entregueEm: a.entregueEm, erro: a.erro };
}
