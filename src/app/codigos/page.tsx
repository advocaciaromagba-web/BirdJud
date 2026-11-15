import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { Estrutura } from "@/componentes/Estrutura";
import { PainelDeCodigos } from "@/componentes/PainelDeCodigos";
import { CampanhaDoCodigo } from "@/componentes/CampanhaDoCodigo";
import { ROTULO_DO_CANAL, TOTAL_DE_AVISOS, linkDoWhatsapp, regras, type Canal } from "@/lib/codigo-de-atendimento";
import { bancaDoEscritorio, painelDeCodigos, panoramaDaCampanha } from "@/lib/codigos-do-escritorio";

export const dynamic = "force-dynamic";

const quando = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

/**
 * Codigos de atendimento: a barreira contra o golpe do falso advogado. Quem
 * atende ve aqui o codigo que tem de DIZER ao cliente no comeco da conversa.
 */
export default async function PaginaDeCodigos() {
  const contexto = await contextoDaPagina(undefined, "CODIGOS");
  const modulos = await modulosAtivos(contexto.escritorioId);
  const moldura = {
    nomeEscritorio: contexto.marca.nome,
    logoUrl: contexto.marca.logoUrl,
    papel: contexto.papel,
    nomeUsuario: contexto.nomeUsuario,
    acesso: contexto.acesso,
    modulos,
    titulo: "Códigos de atendimento",
    chamada: "A barreira contra o golpe do falso advogado: o escritório diz o código do cliente no começo de toda conversa.",
  };

  // O codigo e a chave do cliente com o escritorio: o suporte nao le.
  if (contexto.suporte) {
    return (
      <Estrutura {...moldura}>
        <p className="aviso-atencao mt-4">Os códigos de atendimento são do escritório e dos clientes dele. O acesso de suporte não os mostra.</p>
      </Estrutura>
    );
  }

  const ehAdmin = contexto.papel === "ADMIN";
  const [linhas, { banca, temTelefone }, panorama] = await Promise.all([
    painelDeCodigos(contexto.escritorioId),
    bancaDoEscritorio(contexto.escritorioId),
    ehAdmin ? panoramaDaCampanha(contexto.escritorioId) : Promise.resolve(null),
  ]);

  return (
    <Estrutura {...moldura}>
      <section className="cartao mt-4">
        <h2 className="text-lg font-semibold">Como usar, em todo atendimento</h2>
        <ol className="mt-2 grid gap-1.5 text-sm text-slate-700">
          <li>
            <strong>1. Diga o código primeiro.</strong> Ao ligar ou escrever para o cliente, comece pelo código dele. É assim que ele sabe que é o
            escritório.
          </li>
          <li>
            <strong>2. Nunca peça o código ao cliente.</strong> Quem pede o código é o golpista. O cliente foi orientado a não dizer a ninguém.
          </li>
          <li>
            <strong>3. Código esquecido só volta de dois jeitos:</strong> pessoalmente, no escritório, ou pelo e-mail que já está no cadastro. Nunca
            para um número ou e-mail que a pessoa ditar na hora.
          </li>
          <li>
            <strong>4. Vazou? Troque.</strong> Se o cliente contou o código a alguém, o administrador troca e o antigo deixa de valer na hora.
          </li>
        </ol>
        {!temTelefone ? (
          <p className="aviso-atencao mt-3 text-sm">
            Falta o telefone de atendimento do escritório, em Configurações. O contrato e os avisos mandam o cliente ligar para ele na dúvida.
          </p>
        ) : null}
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-slate-600">O que o cliente recebe por escrito</summary>
          <ul className="mt-2 grid gap-1 text-slate-700">
            {regras(banca).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      </section>

      <PainelDeCodigos
        ehAdmin={ehAdmin}
        linhas={linhas.map((l) => ({
          clienteId: l.clienteId,
          nome: l.nome,
          codigo: l.codigo,
          // O link e montado aqui, no servidor, com o telefone DO CADASTRO.
          whatsapp: l.codigo ? linkDoWhatsapp({ nome: l.nome, telefone: l.telefone, documento: l.documento }, l.codigo, banca.nome) : null,
          temTelefone: Boolean(l.telefone?.trim()),
          temEmail: l.temEmail,
          aviso:
            l.avisoEtapa === 0
              ? "não avisado"
              : l.avisoEtapa >= TOTAL_DE_AVISOS
                ? "campanha concluída"
                : `aviso ${l.avisoEtapa} de ${TOTAL_DE_AVISOS}`,
          podeTestarAviso: Boolean(l.codigo) && (!l.avisoEmailEm || !l.avisoWhatsappEm),
          ultima: l.ultimaEntrega
            ? `${ROTULO_DO_CANAL[l.ultimaEntrega.canal as Canal] ?? l.ultimaEntrega.canal}, em ${quando.format(l.ultimaEntrega.quando)}${l.ultimaEntrega.por ? `, por ${l.ultimaEntrega.por}` : ""}`
            : null,
        }))}
      />

      {panorama ? <CampanhaDoCodigo panorama={panorama} totalDeAvisos={TOTAL_DE_AVISOS} /> : null}
    </Estrutura>
  );
}
