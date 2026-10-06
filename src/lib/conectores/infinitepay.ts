// Cobrancas pela InfinitePay, com a conta do proprio escritorio.
//
// A CREDENCIAL AQUI NAO E UM SEGREDO. A conta e identificada pela InfiniteTag,
// que e publica — e o mesmo "@usuario" com que qualquer pessoa manda Pix para
// o escritorio. Ela diz PARA ONDE o dinheiro vai, nao prova quem esta pedindo.
// Por isso o campo nao e de senha: esconder na tela daria a impressao errada
// de que ha um segredo a proteger.
import { descreverFalha, type Conector } from "./tipos";
import { limparHandle } from "../infinitepay";

export const conectorInfinitePay: Conector = {
  tipo: "INFINITEPAY",
  rotulo: "InfinitePay (cobrancas)",
  descricao:
    "Link de pagamento com Pix e cartao na conta InfinitePay do escritorio. " +
    "Segunda opcao, ao lado do Asaas.",
  modulo: "COBRANCAS",
  campos: [
    {
      nome: "handle",
      rotulo: "InfiniteTag",
      tipo: "text",
      obrigatorio: true,
      ajuda:
        "O @usuario da conta no app InfinitePay — o mesmo com que se recebe Pix por la. " +
        "Pode colar com $, com @ ou o endereco inteiro do perfil.",
    },
  ],
  resumo: (dados) => {
    const handle = limparHandle(String(dados.handle ?? ""));
    return handle ? `InfiniteTag @${handle}` : "InfiniteTag invalida";
  },

  async testar(dados) {
    // NAO HA ENDPOINT DE TESTE. A API deles so tem criar link e conferir
    // pagamento, e as duas mexem em cobranca de verdade: "testar" criando um
    // link seria deixar lixo na conta do escritorio a cada clique. Entao o que
    // se confere e o que da para conferir sem efeito colateral — se a tag tem
    // a forma de uma tag. Dizer isso e melhor que inventar um teste que nao
    // testa nada e devolver um "ok" sem valor.
    try {
      const handle = limparHandle(String(dados.handle ?? ""));
      if (!handle) {
        return {
          ok: false,
          detalhe: "Nao parece uma InfiniteTag. Confira no app, em Perfil.",
        };
      }
      return {
        ok: true,
        detalhe:
          `InfiniteTag @${handle} gravada. A InfinitePay nao oferece um jeito de ` +
          "conferir a tag sem criar cobranca, entao a primeira cobranca e que vai dizer " +
          "se esta certa — emita uma de valor baixo para si mesmo antes de usar com cliente.",
      };
    } catch (erro) {
      return { ok: false, detalhe: descreverFalha(erro) };
    }
  },
};
