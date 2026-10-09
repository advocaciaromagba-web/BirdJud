import { redirect } from "next/navigation";
import { exigirSessao, SemSessao } from "@/lib/sessao";
import { documentosPendentes } from "@/lib/aceite";
import { DOCUMENTOS, VERSAO_DOS_DOCUMENTOS } from "@/lib/juridico";
import { FormularioAceite } from "@/componentes/FormularioAceite";

export const dynamic = "force-dynamic";

/**
 * Aceite dos documentos, antes de usar o sistema.
 *
 * Conta implantada pela plataforma chega sem aceite: quem aceita e o
 * escritorio, nao a Blackbird por ele. E documento que muda de versao volta a
 * passar por aqui, so com o que mudou.
 */
export default async function PaginaAceite() {
  let contexto;
  try {
    contexto = await exigirSessao();
  } catch (erro) {
    if (erro instanceof SemSessao) redirect("/login");
    throw erro;
  }
  const pendentes = await documentosPendentes(contexto.escritorioId);
  if (pendentes.length === 0) redirect("/");

  return (
    <main className="pagina-estreita">
      <p className="sobretitulo">{contexto.marca.nome}</p>
      <h1 className="mt-1">Antes de comecar</h1>
      {contexto.papel === "ADMIN" ? (
        <>
          <p className="mt-3 leitura text-slate-700">
            O sistema do escritorio esta pronto. Falta o aceite dos documentos
            que regem o uso: os termos, o contrato e o acordo de tratamento de
            dados pessoais (LGPD). O aceite fica registrado com o seu nome, a
            data, a hora e o endereco de onde foi feito.
          </p>
          <FormularioAceite
            documentos={DOCUMENTOS.filter((d) => pendentes.includes(d.chave)).map((d) => ({
              rotulo: d.rotulo,
              caminho: d.caminho,
            }))}
            versao={VERSAO_DOS_DOCUMENTOS}
          />
        </>
      ) : (
        <p className="mt-3 leitura text-slate-700">
          O administrador do escritorio ainda precisa aceitar os documentos de
          uso do sistema. Assim que ele aceitar, o acesso fica liberado.
        </p>
      )}
    </main>
  );
}
