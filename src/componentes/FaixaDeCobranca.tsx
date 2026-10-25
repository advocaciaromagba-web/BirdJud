import Link from "next/link";
import { getServerSession } from "next-auth";
import { opcoesAuth } from "@/lib/auth";
import { escritorioDoEndereco } from "@/lib/sessao";
import { prismaPlataforma } from "@/lib/prisma";
import { dataDaSuspensao } from "@/lib/avisos-de-cobranca";
import { emReais } from "@/lib/dinheiro";

const DIA = 24 * 60 * 60 * 1000;
const dia = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/**
 * Faixa em toda tela do escritorio quando ha fatura do BirdJud vencida: o
 * aviso por e-mail pode cair no spam, e a suspensao nao deve ser surpresa.
 * O administrador ve o valor e o link; o resto da equipe, so que ha uma
 * pendencia e a data.
 */
export async function FaixaDeCobranca() {
  const marca = await escritorioDoEndereco();
  if (!marca?.id || marca.status === "ENCERRADO") return null;
  const fatura = await prismaPlataforma().fatura.findFirst({
    where: { escritorioId: marca.id, status: "ABERTA", vencimento: { lt: new Date(Date.now() - DIA) } },
    orderBy: { vencimento: "asc" },
    select: { valorCentavos: true, vencimento: true, linkPagamento: true },
  });
  if (!fatura) return null;
  const [sessao, escritorio] = await Promise.all([
    getServerSession(opcoesAuth),
    prismaPlataforma().escritorio.findUnique({ where: { id: marca.id }, select: { suspensaoAdiadaAte: true } }),
  ]);
  const suspensao = dia(dataDaSuspensao(fatura.vencimento, escritorio?.suspensaoAdiadaAte));
  const admin = sessao?.papel === "ADMIN";

  return (
    <div role="alert" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-red-50 px-4 py-2 text-center text-sm text-red-900">
      {admin ? (
        <>
          <span>
            A fatura do BirdJud de {emReais(fatura.valorCentavos)}, vencida em {dia(fatura.vencimento)}, está em aberto.
            Sem o pagamento, o acesso será suspenso em {suspensao}.
          </span>
          {fatura.linkPagamento ? (
            <a href={fatura.linkPagamento} target="_blank" rel="noreferrer" className="font-semibold underline">
              Pagar agora
            </a>
          ) : (
            <Link href="/plano" className="font-semibold underline">
              Ver a fatura
            </Link>
          )}
        </>
      ) : (
        <span>
          Há uma pendência financeira do escritório com o BirdJud. Avise o administrador: sem o pagamento, o acesso
          será suspenso em {suspensao}.
        </span>
      )}
    </div>
  );
}
