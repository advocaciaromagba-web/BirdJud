// Papeis sugeridos de participante.
//
// SO CONSTANTES, sem import nenhum: este arquivo tambem e lido pela tela da
// agenda, que roda no navegador. Deixar isto dentro de participantes.ts
// arrastava whatsapp.ts e node:crypto para o pacote do cliente, e o build
// quebrava com "Reading from node:crypto is not handled".
//
// Campo livre na tela, porque a vida tem mais papeis que uma lista.
export const PAPEIS_SUGERIDOS = [
  "cliente",
  "conjuge",
  "testemunha",
  "preposto",
  "perito",
  "assistente tecnico",
  "advogado da parte contraria",
] as const;
