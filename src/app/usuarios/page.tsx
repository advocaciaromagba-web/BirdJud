import { comEscritorio } from "@/lib/prisma";
import { exigirAdmin, SemSessao } from "@/lib/sessao";
import { SemPermissao } from "@/lib/papeis";
import { redirect } from "next/navigation";
import { modulosAtivos } from "@/lib/modulos";
import { usoDaFaixa } from "@/lib/faixas";
import { Estrutura } from "@/componentes/Estrutura";
import { temRemetenteDaPlataforma } from "@/lib/email-plataforma";
import { FormularioCriar } from "@/componentes/FormularioCriar";

const PAPEIS = [
  { valor: "ADMIN", rotulo: "Administrador" },
  { valor: "ADVOGADO", rotulo: "Advogado" },
  { valor: "USUARIO", rotulo: "Usuario de apoio" },
];

export default async function PaginaUsuarios() {
  // Com remetente configurado, o caminho normal e o convite por e-mail.
  const temConvite = temRemetenteDaPlataforma();
  let contexto;
  try {
    contexto = await exigirAdmin();
  } catch (erro) {
    if (erro instanceof SemSessao) redirect("/login");
    if (erro instanceof SemPermissao) {
      return (
        <main className="mx-auto max-w-2xl p-10">
          <h1 className="text-2xl font-bold">Area restrita</h1>
          <p className="mt-3 text-slate-600">
            So administradores do escritorio cadastram usuarios.
          </p>
        </main>
      );
    }
    throw erro;
  }

  const modulos = await modulosAtivos(contexto.escritorioId);
  const uso = await usoDaFaixa(contexto.escritorioId);
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
    }),
  );

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      modulos={modulos}
      titulo="Usuarios"
    >
      <p className="chamada esquerda">
        {temConvite
          ? "O usuario novo recebe um convite por e-mail e escolhe a propria senha. Ninguem precisa passar senha por WhatsApp nem no papel."
          : "Sem remetente de e-mail configurado na plataforma, defina uma senha provisoria aqui e passe para a pessoa; ela troca em Minha conta."}
      </p>

      {/* A faixa limita pessoas; quem esta inativo nao ocupa lugar. */}
      <div className="cartao-aperto mt-4 text-sm">
        <p className="font-semibold">Faixa {uso.rotulo}</p>
        <p className="mt-1 text-slate-600">
          Advogados: {uso.advogados.usados} de {uso.advogados.limite} · Apoio:{" "}
          {uso.apoio.usados} de {uso.apoio.limite}
        </p>
      </div>

      <FormularioCriar
        rota="/api/usuarios"
        campos={[
          { nome: "nome", rotulo: "Nome", obrigatorio: true },
          { nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true },
          {
            nome: "senha",
            rotulo: temConvite
              ? "Senha provisoria (opcional)"
              : "Senha provisoria (minimo 10 caracteres)",
            tipo: "password",
            obrigatorio: !temConvite,
            ajuda: temConvite
              ? "Deixe em branco para o sistema enviar um convite por e-mail."
              : "Minimo de 10 caracteres.",
          },
          {
            nome: "papel",
            rotulo: "Papel",
            tipo: "select",
            opcoes: PAPEIS,
            obrigatorio: true,
          },
          { nome: "oab", rotulo: "OAB (advogados)" },
        ]}
        textoBotao="Cadastrar"
      />

      <p className="mt-6 text-sm">
        <a href="/api/exportacao" className="text-marca underline">
          Baixar todos os dados do escritorio (JSON)
        </a>
        <span className="block text-xs text-slate-500">
          Inclui clientes, processos, agenda, financeiro e faturas. Nao inclui
          senhas nem credenciais de integracao.
        </span>
      </p>

      <ul className="mt-6 divide-y divide-slate-200">
        {usuarios.map((usuario) => (
          <li key={usuario.id} className="py-3">
            <p className="font-semibold">
              {usuario.nome}{" "}
              {usuario.id === contexto.usuarioId ? (
                <span className="text-xs text-slate-500">(voce)</span>
              ) : null}
            </p>
            <p className="text-sm text-slate-500">
              {usuario.email} · {usuario.papel}
              {usuario.doisFatores ? " · 2FA ativo" : ""}
              {usuario.ativo ? "" : " · inativo"}
            </p>
          </li>
        ))}
      </ul>
    </Estrutura>
  );
}
