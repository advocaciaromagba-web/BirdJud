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
  if (!pessoa) throw new Error("Pessoa nao encontrada.");

  const { token } = await criarPedido(escritorioId, usuarioId, null, "CONVITE");
  const link = `https://${quem.slug}.${dominioDaPlataforma()}/redefinir-senha?t=${token}&c=1`;
  if (!temRemetenteDaPlataforma()) {
    return { email: pessoa.email, enviado: false, link, motivo: "A plataforma nao tem remetente de e-mail." };
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
    console.error("convite nao enviado:", falha);
    return { email: pessoa.email, enviado: false, link, motivo: "O e-mail nao pode ser enviado agora." };
  }
}
