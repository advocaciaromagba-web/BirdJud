import { redirect } from "next/navigation";
import { comEscritorio } from "@/lib/prisma";
import { exigirAdmin } from "@/lib/sessao";
import { SemPermissao } from "@/lib/papeis";
import { Navegacao } from "@/componentes/Navegacao";
import { FormularioCriar } from "@/componentes/FormularioCriar";

const PAPEIS = [
  { valor: "ADMIN", rotulo: "Administrador" },
  { valor: "ADVOGADO", rotulo: "Advogado" },
  { valor: "USUARIO", rotulo: "Usuario de apoio" },
];

export default async function PaginaUsuarios() {
  let contexto;
  try {
    contexto = await exigirAdmin();
  } catch (erro) {
    if (erro instanceof SemPermissao) {
      return (
        <main className="mx-auto max-w-2xl p-10">
          <h1 className="text-2xl font-bold">Area restrita</h1>
          <p className="mt-3 text-neutral-600">
            So administradores do escritorio cadastram usuarios.
          </p>
        </main>
      );
    }
    redirect("/login");
  }

  const usuarios = await comEscritorio(contexto.escritorioId, (db) =>
    db.usuario.findMany({
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        email: true,
        papel: true,
        ativo: true,
        doisFatores: true,
        ultimoAcesso: true,
      },
    })
  );

  return (
    <>
      <Navegacao nomeEscritorio={contexto.marca.nome} papel={contexto.papel} />
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold">Usuarios</h1>
        <p className="mt-1 text-sm text-neutral-500">
          A senha definida aqui e provisoria: o usuario a troca em Minha conta.
        </p>

        <FormularioCriar
          rota="/api/usuarios"
          campos={[
            { nome: "nome", rotulo: "Nome", obrigatorio: true },
            { nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true },
            {
              nome: "senha",
              rotulo: "Senha provisoria (minimo 10 caracteres)",
              tipo: "password",
              obrigatorio: true,
            },
            { nome: "papel", rotulo: "Papel", tipo: "select", opcoes: PAPEIS, obrigatorio: true },
            { nome: "oab", rotulo: "OAB (advogados)" },
          ]}
          textoBotao="Cadastrar"
        />

        <ul className="mt-6 divide-y divide-neutral-200">
          {usuarios.map((usuario) => (
            <li key={usuario.id} className="py-3">
              <p className="font-semibold">
                {usuario.nome}{" "}
                {usuario.id === contexto.usuarioId ? (
                  <span className="text-xs text-neutral-500">(voce)</span>
                ) : null}
              </p>
              <p className="text-sm text-neutral-500">
                {usuario.email} · {usuario.papel}
                {usuario.doisFatores ? " · 2FA ativo" : ""}
                {usuario.ativo ? "" : " · inativo"}
              </p>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
