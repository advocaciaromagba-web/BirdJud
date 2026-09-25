// Documentos juridicos e registro de aceite.
//
// So constantes e tipos: este arquivo tambem e lido pelo formulario de
// cadastro, que roda no navegador.

/**
 * Versao vigente dos documentos.
 *
 * Mudou o texto de qualquer documento, suba a versao. Cada aceite grava a
 * versao aceita; sem subir, o registro passaria a apontar para um texto que o
 * escritorio nunca leu.
 */
export const VERSAO_DOS_DOCUMENTOS = "2026-09-18";

export const DOCUMENTOS = [
  { chave: "TERMOS", rotulo: "Termos de Uso", caminho: "TERMOS-DE-USO" },
  {
    chave: "CONTRATO",
    rotulo: "Contrato de licenca e servico",
    caminho: "CONTRATO-SAAS",
  },
  {
    chave: "LGPD",
    rotulo: "Acordo de tratamento de dados (LGPD)",
    caminho: "ACORDO-LGPD",
  },
] as const;

export type DocumentoJuridico = (typeof DOCUMENTOS)[number]["chave"];

/** Dias entre o encerramento do escritorio e a exclusao definitiva. */
export const PRAZO_DE_RETENCAO_DIAS = 90;
