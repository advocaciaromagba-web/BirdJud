// Ligar e desligar o envio automatico de um cliente, por canal.
//
// Regra em consentimento-de-envio.ts. Aqui fica o que acontece quando o
// administrador mexe na chave:
//
//  - grava quem mexeu e quando (a tela mostra);
//  - cancela os avisos daquele canal que ja estavam na fila para o cliente:
//    a chave e conferida ao GERAR o aviso, e o que foi gerado antes sairia
//    mesmo assim;
//  - repassa ao Asaas, que manda os proprios avisos de cobranca: com algum
//    canal desligado, as notificacoes do Asaas para esse cliente param (o
//    Asaas nao separa e-mail de SMS/WhatsApp por cliente).
import { comEscritorio } from "./prisma";
import { SemContaDeCobranca, chamarAsaas, chaveDoEscritorio } from "./cobrancas";

export type MudancaDeEnvio = { notificarWhatsapp?: boolean; notificarEmail?: boolean };

export class ClienteNaoEncontrado extends Error {
  readonly status = 404;
  constructor() {
    super("Cliente não encontrado.");
    this.name = "ClienteNaoEncontrado";
  }
}

/** O Asaas deve avisar este cliente? So com os dois canais ligados. */
export function asaasPodeAvisar(c: { notificarWhatsapp: boolean; notificarEmail: boolean }): boolean {
  return c.notificarWhatsapp && c.notificarEmail;
}

export async function definirEnvioDoCliente(
  escritorioId: string,
  clienteId: string,
  mudanca: MudancaDeEnvio,
  quem: string,
): Promise<{ notificarWhatsapp: boolean; notificarEmail: boolean; avisosCancelados: number; asaas: "ok" | "sem-conta" | "falhou" | "nao-se-aplica" }> {
  const antes = await comEscritorio(escritorioId, (db) =>
    db.cliente.findFirst({ where: { id: clienteId }, select: { id: true, notificarWhatsapp: true, notificarEmail: true, idNoAsaas: true } }),
  );
  if (!antes) throw new ClienteNaoEncontrado();

  const depois = await comEscritorio(escritorioId, (db) =>
    db.cliente.update({
      where: { id: clienteId },
      data: { ...mudanca, envioAlteradoEm: new Date(), envioAlteradoPor: quem },
      select: { notificarWhatsapp: true, notificarEmail: true },
    }),
  );

  const desligados = [
    ...(antes.notificarWhatsapp && !depois.notificarWhatsapp ? ["WHATSAPP"] : []),
    ...(antes.notificarEmail && !depois.notificarEmail ? ["EMAIL"] : []),
  ];
  let avisosCancelados = 0;
  if (desligados.length) {
    avisosCancelados = await comEscritorio(escritorioId, async (db) => {
      const participacoes = await db.participanteDeCompromisso.findMany({ where: { clienteId }, select: { id: true } });
      const r = await db.aviso.updateMany({
        where: {
          estado: "PENDENTE",
          canal: { in: desligados },
          OR: [{ clienteId }, { participanteId: { in: participacoes.map((p) => p.id) } }],
        },
        data: { estado: "CANCELADO" },
      });
      return r.count;
    });
  }

  let asaas: "ok" | "sem-conta" | "falhou" | "nao-se-aplica" = "nao-se-aplica";
  if (antes.idNoAsaas && asaasPodeAvisar(antes) !== asaasPodeAvisar(depois)) {
    try {
      const chave = await chaveDoEscritorio(escritorioId);
      await chamarAsaas(chave, `/customers/${antes.idNoAsaas}`, {
        method: "POST",
        body: JSON.stringify({ notificationDisabled: !asaasPodeAvisar(depois) }),
      });
      asaas = "ok";
    } catch (erro) {
      asaas = erro instanceof SemContaDeCobranca ? "sem-conta" : "falhou";
      console.error(`envio: cliente ${clienteId}, o Asaas não recebeu a mudança — ${(erro as Error).message}`);
    }
  }

  return { ...depois, avisosCancelados, asaas };
}
