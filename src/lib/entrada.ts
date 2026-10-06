// "Entrar no meu escritorio": do que a pessoa digita ate o endereco dela.
//
// POR QUE ISTO EXISTE: cada escritorio mora em <slug>.birdjud.com.br, e o site
// publico nao sabe de quem e o visitante. Sem um caminho de entrada, quem
// chega em birdjud.com.br so encontra o botao de CADASTRO — o cliente que ja
// e cliente precisa lembrar o proprio endereco de cabeca, ou procurar um
// e-mail antigo.
//
// O RISCO QUE MORA AQUI, e que decide o formato desta funcao: uma tela que
// manda o navegador para onde o texto digitado disser e um redirecionamento
// aberto. Um link como birdjud.com.br/entrar?e=site-falso.com sairia do nosso
// dominio levando a confianca dele junto, que e exatamente como se monta uma
// pagina de login falsa convincente.
//
// Por isso o endereco NAO e montado a partir do que foi digitado: do texto sai
// apenas um rotulo validado, e o endereco e construido com o NOSSO dominio.
// Nao ha caminho, nesta funcao, que devolva outro destino — nao por cuidado ao
// escrever, mas por construcao.
import { dominioDaPlataforma } from "./dominio";
import { RESERVADOS } from "./subdominio";

/** Rotulo de DNS valido: letras, digitos e hifen no meio. */
const ROTULO = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Tira acento e troca espaco por nada.
 *
 * As pessoas digitam o NOME do escritorio ("Advocacia Roma"), nao o rotulo.
 * Normalizar aqui e palpite, e palpite errado leva a uma pagina que nao
 * existe — mas o palpite certo poupa a pessoa de adivinhar, e o errado custa
 * uma tela de "escritorio nao encontrado", nao um dado perdido.
 */
function semAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "");
}

/**
 * O rotulo do escritorio a partir do que foi digitado, ou null.
 *
 * Aceita o que as pessoas de fato escrevem:
 *
 *   advocaciaroma
 *   Advocacia Roma
 *   advocaciaroma.birdjud.com.br
 *   https://advocaciaroma.birdjud.com.br/login
 *
 * Devolve null para endereco de OUTRO dominio: nao e nosso, e mandar alguem
 * para la seria o redirecionamento aberto acima.
 */
export function slugDigitado(
  texto: string,
  dominio = dominioDaPlataforma(),
): string | null {
  const bruto = (texto ?? "").trim().toLowerCase();
  if (!bruto) return null;
  const alvo = dominio.trim().toLowerCase();

  // Dois caminhos, separados de proposito. Antes era um so, que limpava
  // caminho e esquema de QUALQUER texto — e "com/barra" virava o escritorio
  // "com". Cortar texto digitado ate sobrar um rotulo valido e jeito de
  // mandar alguem para o lugar errado sem avisar.
  const pareceEndereco = /:\/\//.test(bruto) || bruto.includes(".");

  if (!pareceEndereco) {
    // Nome ou rotulo digitado a mao.
    const limpo = semAcento(bruto);
    if (!ROTULO.test(limpo)) return null;
    return RESERVADOS.has(limpo) ? null : limpo;
  }

  let valor = bruto.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // esquema
  // A barra invertida entra aqui porque alguns navegadores a leem como barra:
  // "site-falso.com\@birdjud.com.br" levaria ao site falso.
  valor = valor.split(/[/\\?#]/)[0] ?? "";
  valor = valor.split("@").pop() ?? ""; // usuario:senha@host
  valor = valor.split(":")[0] ?? ""; // porta
  valor = valor.replace(/\.$/, ""); // raiz do DNS
  if (!valor) return null;

  // Daqui em diante so aceitamos o que esta DENTRO do nosso dominio. Endereco
  // de fora nao vira escritorio: era por aqui que sairia o redirecionamento
  // aberto.
  if (valor === alvo) return null; // o dominio da plataforma nao e escritorio
  if (!valor.endsWith(`.${alvo}`)) return null;
  const rotulo = valor.slice(0, -(alvo.length + 1));
  if (!rotulo || rotulo.includes(".")) return null; // nada de niveis extras
  if (!ROTULO.test(rotulo)) return null;
  return RESERVADOS.has(rotulo) ? null : rotulo;
}

/**
 * O endereco de login do escritorio, ou null.
 *
 * Montado com o NOSSO dominio e um rotulo ja validado. Nao existe entrada que
 * faca esta funcao devolver outro destino.
 */
export function enderecoDeEntrada(
  texto: string,
  dominio = dominioDaPlataforma(),
): string | null {
  const slug = slugDigitado(texto, dominio);
  if (!slug) return null;
  return `https://${slug}.${dominio.trim().toLowerCase()}/login`;
}

/** Onde o navegador lembra o ultimo escritorio usado. */
export const LEMBRANCA = "birdjud_escritorio";
