// Modulo NFSE: nota fiscal de servico pelo Sistema Nacional (Sefin Nacional).
//
// O METODO e o do sistema da Advocacia Roma, que ja emite nota real:
//
//   emissao.ts    — preparar (equipe) -> assinar (titular do e-CNPJ, senha
//                   digitada na hora) -> verificar / cancelar / descartar
//   dps.ts        — o XML da DPS no leiaute nacional v1.01
//   assinar.ts    — assinatura XMLDSig (RSA-SHA1, C14N) aceita pela Sefin
//   api.ts        — a Sefin com TLS mutuo (o certificado e a credencial)
//   certificado.ts— abre o .pfx e o reempacota para o OpenSSL 3
//   regime.ts     — Simples, ISS fixo, regime futuro, IBS/CBS
//   danfse.ts     — o PDF da nota (a API nao gera mais desde 03/08/2026)
//   entrega.ts    — PDF nos documentos do cliente e envio ao cliente
export * from "./emissao";
export { CertificadoInvalido } from "./certificado";
export { depoisDeEmitida, nomeDoPdf } from "./entrega";
export { gerarDanfse } from "./danfse";
