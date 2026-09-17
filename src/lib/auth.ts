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

/** Minutos de bloqueio depois de errar a senha vezes demais. */
const TENTATIVAS_ATE_BLOQUEIO = 5;
const MINUTOS_BLOQUEIO = 15;


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
          if (usuario.doisFatores) {
            const codigo = credenciais?.codigo ?? "";
            if (!(await conferirCodigo(codigo, usuario.doisFatores))) return null;
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
      }
      return token;
    },
    async session({ session, token }) {
      session.escritorioId = token.escritorioId as string;
      session.papel = token.papel as string;
      session.usuarioId = token.sub as string;
      return session;
    },
  },
};

export { TENTATIVAS_ATE_BLOQUEIO, MINUTOS_BLOQUEIO, PROVEDOR, STATUS_QUE_ENTRAM };
