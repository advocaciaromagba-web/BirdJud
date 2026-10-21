// Gente do escritorio: incluir e convidar.
//
// A mesma regra para o administrador do escritorio (tela Usuarios) e para a
// plataforma, quando ela implanta a conta: a vaga da faixa e conferida, a
// senha nasce impossivel de adivinhar e o unico caminho para dentro e o
// convite — que a propria pessoa abre e onde escolhe a senha dela.
import { randomBytes } from "node:crypto";
import { comEscritorio, semEscritorio } from "./prisma";
import { gerarHash } from "./senhas";
import { exigirVagaNaFaixa } from "./faixas";
import {
  criarPedido,
  mensagemDeConvite,
  VALIDADE_DO_CONVITE_MINUTOS,
} from "./redefinicao";
import { enviarPelaPlataforma, temRemetenteDaPlataforma } from "./email-plataforma";
import { dominioDaPlataforma } from "./dominio";
import type { Papel } from "./papeis";

export type NovaPessoa = {
  nome: string;
  email: string;
  papel: Papel;
  oab?: string | null;
  telefone?: string | null;
  recebeWhatsapp?: boolean;
  /** Senha digitada por quem cadastra. Sem ela, a pessoa e convidada. */
  senha?: string;
};

/** Advogado e administrador contam na faixa de advogados. */
export function contaComoAdvogado(papel: string): boolean {
  return papel === "ADVOGADO" || papel === "ADMIN";
}

export async function incluirPessoa(escritorioId: string, p: NovaPessoa) {
  const advogado = contaComoAdvogado(p.papel);
  await exigirVagaNaFaixa(escritorioId, advogado);
  // Sem senha: 32 bytes aleatorios que nunca saem daqui. Nao e senha vazia.
  const senhaHash = await gerarHash(p.senha ?? randomBytes(32).toString("base64url"));
  return comEscritorio(escritorioId, (db) =>
    db.usuario.create({
      data: semEscritorio({
        nome: p.nome,
        email: p.email.toLowerCase(),
        papel: p.papel,
        advogado,
        oab: p.oab?.trim() || null,
        telefone: p.telefone?.trim() || null,
        recebeWhatsapp: Boolean(p.recebeWhatsapp && p.telefone?.trim()),
        senhaHash,
      }),
      select: { id: true, nome: true, email: true, papel: true },
    }),
  );
}

export type ResultadoDoConvite = {
  email: string;
  enviado: boolean;
  /**
   * O link, quando o e-mail nao saiu (plataforma sem remetente, ou falha no
   * envio). Quem convidou repassa por outro meio — e o link vale uma vez so.
   */
  link: string | null;
  motivo: string | null;
};

/** Cria o convite (invalidando os anteriores da pessoa) e tenta mandar por e-mail. */
export async function convidarPessoa(
  escritorioId: string,
  usuarioId: string,
  quem: { nomeDoEscritorio: string; slug: string; nomeDeQuemConvidou: string },
): Promise<ResultadoDoConvite> {
  const pessoa = await comEscritorio(escritorioId, (db) =>
    db.usuario.findFirst({ where: { id: usuarioId }, select: { email: true } }),
  );
  if (!pessoa) throw new Error("Pessoa não encontrada.");

  const { token } = await criarPedido(escritorioId, usuarioId, null, "CONVITE");
  const link = `https://${quem.slug}.${dominioDaPlataforma()}/redefinir-senha?t=${token}&c=1`;
  if (!temRemetenteDaPlataforma()) {
    return { email: pessoa.email, enviado: false, link, motivo: "A plataforma não tem remetente de e-mail." };
  }
  const mensagem = mensagemDeConvite({
    nomeDoEscritorio: quem.nomeDoEscritorio,
    nomeDeQuemConvidou: quem.nomeDeQuemConvidou,
    link,
    validadeMinutos: VALIDADE_DO_CONVITE_MINUTOS,
  });
  try {
    await enviarPelaPlataforma({ para: pessoa.email, ...mensagem });
    return { email: pessoa.email, enviado: true, link: null, motivo: null };
  } catch (falha) {
    console.error("convite não enviado:", falha);
    return { email: pessoa.email, enviado: false, link, motivo: "O e-mail não pode ser enviado agora." };
  }
}

// ---------------------------------------------------------------------------
// Editar quem ja esta na equipe (21/10/2026).
//
// O administrador corrige nome, e-mail, OAB, telefone e papel, e desativa ou
// reativa a pessoa. Tres coisas nao passam por aqui, de proposito: a senha
// (so a propria pessoa, ou o "esqueci a senha"), o segundo fator (idem) e
// as areas (tela de permissoes). Regras que protegem o escritorio:
//
// - ninguem desativa a si mesmo nem rebaixa o proprio papel: o escritorio
//   nao pode ficar sem administrador por um clique errado;
// - o ultimo administrador ativo nao e desativado nem rebaixado;
// - mudar de apoio para advogado, ou reativar, ocupa vaga da faixa;
// - desativar derruba a sessao da pessoa na hora (sessoesValidasApos);
// - OAB nova entra no monitoramento do DJEN, como no cadastro.
// ---------------------------------------------------------------------------

export type EdicaoDePessoa = {
  nome?: string;
  email?: string;
  papel?: Papel;
  oab?: string | null;
  telefone?: string | null;
  ativo?: boolean;
};

export class EdicaoRecusada extends Error {
  readonly status = 400;
  constructor(motivo: string) {
    super(motivo);
    this.name = "EdicaoRecusada";
  }
}

export async function editarPessoa(
  escritorioId: string,
  usuarioId: string,
  dados: EdicaoDePessoa,
  quemEdita: string,
): Promise<{ id: string; nome: string; email: string; papel: string; ativo: boolean; oabMudou: boolean }> {
  const atual = await comEscritorio(escritorioId, (db) =>
    db.usuario.findFirst({
      where: { id: usuarioId },
      select: { id: true, nome: true, email: true, papel: true, oab: true, telefone: true, ativo: true, advogado: true },
    }),
  );
  if (!atual) throw new EdicaoRecusada("Pessoa não encontrada.");

  const papel = dados.papel ?? (atual.papel as Papel);
  const ativo = dados.ativo ?? atual.ativo;
  const ehVoce = usuarioId === quemEdita;

  if (ehVoce && !ativo) throw new EdicaoRecusada("Você não pode desativar a si mesmo.");
  if (ehVoce && atual.papel === "ADMIN" && papel !== "ADMIN") {
    throw new EdicaoRecusada("Você não pode deixar de ser administrador por aqui: peça a outro administrador.");
  }
  if (atual.papel === "ADMIN" && atual.ativo && (papel !== "ADMIN" || !ativo)) {
    const outrosAdmins = await comEscritorio(escritorioId, (db) =>
      db.usuario.count({ where: { papel: "ADMIN", ativo: true, id: { not: usuarioId } } }),
    );
    if (outrosAdmins === 0) throw new EdicaoRecusada("Este é o único administrador ativo do escritório.");
  }

  // Vaga na faixa: so quando a pessoa passa a ocupar uma que nao ocupava.
  const advogado = contaComoAdvogado(papel);
  const ocupavaAdvogado = atual.ativo && atual.advogado;
  const ocupavaApoio = atual.ativo && !atual.advogado;
  if (ativo && advogado && !ocupavaAdvogado) await exigirVagaNaFaixa(escritorioId, true);
  if (ativo && !advogado && !ocupavaApoio) await exigirVagaNaFaixa(escritorioId, false);

  const oab = dados.oab === undefined ? atual.oab : dados.oab?.trim() || null;
  const telefone = dados.telefone === undefined ? atual.telefone : dados.telefone?.trim() || null;
  const desativando = atual.ativo && !ativo;

  const salvo = await comEscritorio(escritorioId, (db) =>
    db.usuario.update({
      where: { id: usuarioId },
      data: {
        nome: dados.nome?.trim() || atual.nome,
        email: dados.email?.trim().toLowerCase() || atual.email,
        papel,
        advogado,
        oab,
        telefone,
        ativo,
        // Sem telefone nao ha WhatsApp para receber.
        ...(telefone ? {} : { recebeWhatsapp: false }),
        ...(desativando ? { sessoesValidasApos: new Date() } : {}),
      },
      select: { id: true, nome: true, email: true, papel: true, ativo: true },
    }),
  );
  return { ...salvo, oabMudou: Boolean(oab && oab !== atual.oab) };
}
