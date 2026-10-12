// Depois que a nota e emitida.
//
//  - o PDF (DANFSe) entra nos documentos do cliente — e, com nuvem
//    conectada, na pasta dele la. So nota de verdade: teste de homologacao
//    nao suja a pasta;
//  - se quem preparou pediu (ex.: junto do recibo), a nota vai ao cliente por
//    e-mail e/ou WhatsApp. Cada nota e entregue uma vez so
//    (enviadaClienteEm). Nota de testes nunca vai ao cliente.
//
// Nada aqui derruba a emissao: a nota ja existe na Receita. Falha vira aviso
// na tela.
import { comEscritorio } from "../prisma";
import { guardarArquivo } from "../arquivos";
import { cutucarNuvem } from "../avisar-nuvem";
import { enviarLote } from "../email";
import { mandarArquivoNoWhatsapp } from "../documento-no-whatsapp";
import { gerarDanfse } from "./danfse";

export type Entrega = { enviados: string[]; falhas: string[]; guardada: boolean };

export function nomeDoPdf(nota: { numeroNaPrefeitura: string | null; numero: number | null }): string {
  const numero = nota.numeroNaPrefeitura ?? (nota.numero !== null ? `DPS ${nota.numero}` : "");
  return `NFS-e ${numero}`.trim() + ".pdf";
}

export async function depoisDeEmitida(escritorioId: string, notaId: string): Promise<Entrega> {
  const entrega: Entrega = { enviados: [], falhas: [], guardada: false };
  const nota = await comEscritorio(escritorioId, (db) =>
    db.notaFiscal.findFirst({ where: { id: notaId }, include: { cliente: true } }),
  );
  if (!nota || nota.status !== "EMITIDA" || !nota.xmlRetorno) return entrega;
  if (nota.ambiente !== "PRODUCAO") return entrega;

  const pdf = await gerarDanfse(nota.xmlRetorno);
  const nome = nomeDoPdf(nota);

  // Nos documentos do cliente, uma vez.
  if (nota.cliente && !nota.arquivoId && nota.assinadaPorId) {
    try {
      const arquivo = await guardarArquivo(escritorioId, {
        nome,
        tipo: "application/pdf",
        conteudo: pdf,
        usuarioId: nota.assinadaPorId,
        clienteId: nota.cliente.id,
        descricao: `Nota fiscal de servico — ${nota.descricao.slice(0, 120)}`,
      });
      await comEscritorio(escritorioId, (db) =>
        db.notaFiscal.update({ where: { id: nota.id }, data: { arquivoId: arquivo.id } }),
      );
      await cutucarNuvem(escritorioId);
      entrega.guardada = true;
    } catch (e) {
      console.error("[nfse] nao foi possivel guardar o PDF da nota:", (e as Error).message);
    }
  }

  // Ao cliente, pelos canais pedidos.
  if (!nota.cliente || nota.envioCliente.length === 0 || nota.enviadaClienteEm) return entrega;
  const cliente = nota.cliente;

  if (nota.envioCliente.includes("EMAIL")) {
    if (!cliente.email) entrega.falhas.push("E-mail: cliente nao tem e-mail cadastrado.");
    else {
      try {
        const r = await enviarLote(escritorioId, [
          {
            para: cliente.email,
            assunto: "Nota fiscal de servico (NFS-e)",
            texto: `Ola, ${cliente.nome}.\n\nSegue em anexo a nota fiscal de servico (NFS-e) referente ao pagamento realizado.\n\nDocumento emitido pelo Sistema Nacional da NFS-e.`,
            anexos: [{ nome, conteudo: pdf, tipo: "application/pdf" }],
          },
        ]);
        if (r.enviadas > 0) entrega.enviados.push("e-mail");
        else entrega.falhas.push(`E-mail: ${r.falhas[0]?.motivo ?? "nao saiu"}`);
      } catch (e) {
        entrega.falhas.push(`E-mail: ${(e as Error).message}`);
      }
    }
  }
  if (nota.envioCliente.includes("WHATSAPP")) {
    try {
      await mandarArquivoNoWhatsapp(
        escritorioId,
        {
          clienteId: cliente.id,
          nomeDoCliente: cliente.nome,
          telefoneDoCadastro: cliente.telefone,
          arquivo: pdf,
          nomeDoArquivo: nome,
          oQueE: "Nota fiscal de servico",
          oQueFazer: "Guarde esta nota fiscal",
          rotulo: "NFSE",
        },
        nota.assinadaPorId,
      );
      entrega.enviados.push("WhatsApp");
    } catch (e) {
      entrega.falhas.push(`WhatsApp: ${(e as Error).message}`);
    }
  }
  if (entrega.enviados.length > 0) {
    await comEscritorio(escritorioId, (db) =>
      db.notaFiscal.update({ where: { id: nota.id }, data: { enviadaClienteEm: new Date() } }),
    );
  }
  return entrega;
}
