// Autenticacao: NextAuth com credenciais, sessao em JWT.
//
// O escritorio NAO vem do formulario: vem do subdominio, resolvido no servidor.
// Assim ninguem entra em um escritorio digitando outro id no corpo do POST.
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { comEscritorio } from "./prisma";
import { escritorioPorSlug } from "./escritorio";
import { slugDoHost } from "./subdominio";
import { conferirSenha } from "./senhas";
import { conferirCodigo } from "./dois-fatores";
import {
  PAPEL_OPERADOR,
  PROVEDOR,
  PROVEDOR_OPERADOR,
  STATUS_QUE_ENTRAM,
} from "./auth-comum";
import { prismaPlataforma } from "./prisma";
import { registrarTentativa } from "./limite";

/** Minutos de bloqueio depois de errar a senha vezes demais. */
const TENTATIVAS_ATE_BLOQUEIO = 5;
const MINUTOS_BLOQUEIO = 15;

/**
 * Limite por ORIGEM, alem do bloqueio por conta.
 *
 * O bloqueio por conta protege uma senha; nao protege contra quem testa a
 * mesma senha em cem contas (o "credential stuffing" que vive de vazamento de
 * outro site). Sao dois ataques diferentes e precisam de duas defesas.
 */
const TENTATIVAS_POR_ORIGEM = 30;
const JANELA_DA_ORIGEM = 15 * 60;

/** O operador nao tem coluna de bloqueio: o limite dele e por conta e origem. */
const TENTATIVAS_DO_OPERADOR = 10;
const JANELA_DO_OPERADOR = 15 * 60;

/** IP de quem chamou, como o NextAuth entrega os cabecalhos. */
function origemDaTentativa(cabecalhos: Record<string, unknown> | undefined): string {
  const encaminhado = cabecalhos?.["x-forwarded-for"];
  if (typeof encaminhado === "string" && encaminhado.trim()) {
    return encaminhado.split(",")[0]!.trim();
  }
  const real = cabecalhos?.["x-real-ip"];
  return typeof real === "string" && real.trim() ? real.trim() : "sem-ip";
}


export const opcoesAuth: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      // id e o que o formulario passa para signIn(); "name" seria so o rotulo.
      id: PROVEDOR,
      name: "E-mail e senha",
      credentials: {
        email: { label: "E-mail", type: "email" },
        senha: { label: "Senha", type: "password" },
        codigo: { label: "Codigo de 6 digitos", type: "text" },
      },
      async authorize(credenciais, req) {
        const email = credenciais?.email?.trim().toLowerCase();
        const senha = credenciais?.senha;
        if (!email || !senha) return null;

        // O escritorio vem do endereco, resolvido aqui no servidor. Nada do
        // corpo do POST participa dessa decisao: se viesse de la, bastaria
        // forjar o id de outro escritorio ou um status que ja esta suspenso.
        const origem = origemDaTentativa(req?.headers as Record<string, unknown> | undefined);
        const porOrigem = await registrarTentativa(
          `login:${origem}`,
          TENTATIVAS_POR_ORIGEM,
          JANELA_DA_ORIGEM
        );
        if (!porOrigem.permitido) return null;

        const marca = await escritorioPorSlug(slugDoHost(req?.headers?.host ?? null) ?? "");
        if (!marca?.id) return null;

        // Escritorio suspenso ou encerrado nao abre sessao nenhuma.
        if (!marca.status || !STATUS_QUE_ENTRAM.has(marca.status)) return null;

        const escritorioId = marca.id;

        return comEscritorio(escritorioId, async (db) => {
          const usuario = await db.usuario.findFirst({ where: { email } });
          if (!usuario || !usuario.ativo) return null;

          if (usuario.bloqueadoAte && usuario.bloqueadoAte > new Date()) return null;

          const senhaOk = await conferirSenha(senha, usuario.senhaHash);
          if (!senhaOk) {
            const tentativas = usuario.tentativasFalhas + 1;
            await db.usuario.update({
              where: { id: usuario.id },
              data: {
                tentativasFalhas: tentativas,
                bloqueadoAte:
                  tentativas >= TENTATIVAS_ATE_BLOQUEIO
                    ? new Date(Date.now() + MINUTOS_BLOQUEIO * 60_000)
                    : null,
              },
            });
            return null;
          }

          // Segundo fator, quando o usuario ativou.
          //
          // Errar o codigo conta tentativa, igual a senha errada. Sem isso,
          // quem ja tem a senha teria tentativas infinitas contra um numero de
          // seis digitos — o segundo fator viraria enfeite.
          if (usuario.doisFatores) {
            const codigo = credenciais?.codigo ?? "";
            if (!(await conferirCodigo(codigo, usuario.doisFatores))) {
              const tentativas = usuario.tentativasFalhas + 1;
              await db.usuario.update({
                where: { id: usuario.id },
                data: {
                  tentativasFalhas: tentativas,
                  bloqueadoAte:
                    tentativas >= TENTATIVAS_ATE_BLOQUEIO
                      ? new Date(Date.now() + MINUTOS_BLOQUEIO * 60_000)
                      : null,
                },
              });
              return null;
            }
          }

          await db.usuario.update({
            where: { id: usuario.id },
            data: { tentativasFalhas: 0, bloqueadoAte: null, ultimoAcesso: new Date() },
          });

          return {
            id: usuario.id,
            name: usuario.nome,
            email: usuario.email,
            escritorioId,
            papel: usuario.papel,
          };
        });
      },
    }),
    CredentialsProvider({
      id: PROVEDOR_OPERADOR,
      name: "Operador da plataforma",
      credentials: {
        email: { label: "E-mail", type: "email" },
        senha: { label: "Senha", type: "password" },
      },
      /**
       * Login do operador da plataforma (nos), separado do login dos
       * escritorios. So vale no endereco da plataforma: dentro do subdominio
       * de um escritorio, nem tenta.
       */
      async authorize(credenciais, req) {
        if (slugDoHost(req?.headers?.host ?? null)) return null;

        const email = credenciais?.email?.trim().toLowerCase();
        const senha = credenciais?.senha;
        if (!email || !senha) return null;

        // Esta e a conta que enxerga todos os escritorios, e ela nao tem
        // coluna de bloqueio como o usuario de escritorio. O limite aqui vale
        // por conta E por origem: sem ele, sao tentativas infinitas contra a
        // senha mais importante do sistema.
        const origem = origemDaTentativa(req?.headers as Record<string, unknown> | undefined);
        for (const chave of [`operador:${email}`, `operador-origem:${origem}`]) {
          const limite = await registrarTentativa(
            chave,
            TENTATIVAS_DO_OPERADOR,
            JANELA_DO_OPERADOR
          );
          if (!limite.permitido) return null;
        }

        const operador = await prismaPlataforma().operadorPlataforma.findUnique({
          where: { email },
        });
        if (!operador?.ativo) return null;
        if (!(await conferirSenha(senha, operador.senhaHash))) return null;

        return {
          id: operador.id,
          name: operador.nome,
          email: operador.email,
          // Operador nao pertence a escritorio nenhum — e o que a guarda
          // de rota do escritorio confere para nunca deixa-lo entrar em um.
          escritorioId: "",
          papel: PAPEL_OPERADOR,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.escritorioId = user.escritorioId;
        token.papel = user.papel;
        // Momento da emissao: e o que permite invalidar sessoes antigas quando
        // a senha muda ou o usuario e desativado.
        token.emitidaEm = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      session.escritorioId = token.escritorioId as string;
      session.papel = token.papel as string;
      session.usuarioId = token.sub as string;
      session.emitidaEm = (token.emitidaEm as number | undefined) ?? 0;
      return session;
    },
  },
};

export {
  TENTATIVAS_ATE_BLOQUEIO,
  MINUTOS_BLOQUEIO,
  TENTATIVAS_POR_ORIGEM,
  TENTATIVAS_DO_OPERADOR,
  PROVEDOR,
  STATUS_QUE_ENTRAM,
};
