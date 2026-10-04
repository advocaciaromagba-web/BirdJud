/**
 * De qual endereco veio a requisicao.
 *
 * POR QUE ISTO EXISTE SEPARADO: todo teto de tentativa do sistema e contado
 * por origem — login, cadastro publico, redefinicao de senha, destravamento da
 * administracao, chamadas de IA. Se quem ataca escolhe a propria origem, todos
 * esses tetos deixam de existir ao mesmo tempo, e nenhum deles reclama.
 *
 * O ERRO QUE ISTO CORRIGE: a leitura anterior pegava o PRIMEIRO valor de
 * X-Forwarded-For. Esse cabecalho e uma lista que cresce da esquerda para a
 * direita, e cada proxy ACRESCENTA ao fim o endereco de quem falou com ele. O
 * comeco da lista, portanto, e texto que o cliente mandou — se ele enviar
 *
 *     X-Forwarded-For: 1.2.3.4
 *
 * a borda acrescenta o endereco real e a lista vira "1.2.3.4, <real>". Lendo a
 * esquerda, o sistema acreditava no 1.2.3.4. Trocando esse valor a cada
 * chamada, cinco tentativas viravam cinco chaves de limite diferentes e o teto
 * nunca fechava.
 *
 * A REGRA AQUI: ler da DIREITA para a esquerda e ficar com o primeiro endereco
 * valido e publico. O que o cliente escreve fica sempre a esquerda do que a
 * nossa borda escreveu, entao ele nao alcanca essa posicao. Enderecos privados
 * sao pulados porque sao salto interno da infraestrutura, nao o visitante.
 *
 * ATRAS DO CLOUDFLARE: quando a borda da Cloudflare esta na frente, ela poe o
 * endereco do visitante em CF-Connecting-IP e APAGA o que o cliente tiver
 * mandado nesse cabecalho. Ai ele e melhor que a lista — mas so vale se
 * estivermos mesmo atras dela: solto na internet, esse cabecalho e so mais um
 * texto que qualquer um escreve. Por isso depende de ATRAS_DO_CLOUDFLARE=1,
 * que e uma afirmacao nossa sobre a infraestrutura, nao do visitante.
 */

/** Sem origem legivel. Uma chave so, de proposito: ver nota em chaveDeOrigem. */
export const SEM_ORIGEM = "sem-ip";

function ehIPv4(valor: string): boolean {
  const partes = valor.split(".");
  if (partes.length !== 4) return false;
  return partes.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

function ehIPv6(valor: string): boolean {
  // Suficiente para distinguir endereco de lixo; nao e validacao de RFC.
  return /^[0-9a-f:]+$/i.test(valor) && valor.includes(":");
}

export function ehEndereco(valor: string): boolean {
  return ehIPv4(valor) || ehIPv6(valor);
}

/**
 * Endereco de salto interno: nao e visitante.
 *
 * Importa porque, se a infraestrutura puser um salto privado por ultimo, ficar
 * com ele faria TODO MUNDO dividir a mesma chave de limite — e ai o primeiro
 * que errasse a senha trancaria o sistema para os outros.
 */
export function ehPrivado(valor: string): boolean {
  if (ehIPv6(valor)) {
    const v = valor.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = valor.split(".").map(Number);
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b! >= 16 && b! <= 31) return true;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 100 && b! >= 64 && b! <= 127) return true; // CGNAT
  return false;
}

type Cabecalhos = { get(nome: string): string | null };

/** Aceita tanto Headers quanto o objeto simples que o NextAuth entrega. */
function ler(fonte: Cabecalhos | Record<string, unknown> | undefined, nome: string): string | null {
  if (!fonte) return null;
  if (typeof (fonte as Cabecalhos).get === "function") {
    return (fonte as Cabecalhos).get(nome);
  }
  const bruto = (fonte as Record<string, unknown>)[nome];
  return typeof bruto === "string" ? bruto : null;
}

export function atrasDoCloudflare(): boolean {
  return process.env.ATRAS_DO_CLOUDFLARE === "1";
}

/**
 * O endereco de quem chamou, ou null quando nao da para saber.
 *
 * Devolve null em vez de chutar: chutar aqui e pior que nao saber, porque o
 * chute vira chave de limite e trancaria gente inocente.
 */
export function ipDeQuemChamou(
  cabecalhos: Cabecalhos | Record<string, unknown> | undefined,
): string | null {
  if (atrasDoCloudflare()) {
    const daCloudflare = ler(cabecalhos, "cf-connecting-ip")?.trim();
    if (daCloudflare && ehEndereco(daCloudflare)) return daCloudflare;
  }

  const lista = ler(cabecalhos, "x-forwarded-for");
  if (lista) {
    const partes = lista.split(",").map((p) => p.trim());
    // Da direita para a esquerda: o cliente nao alcanca o fim da lista.
    for (let i = partes.length - 1; i >= 0; i--) {
      const p = partes[i]!;
      if (ehEndereco(p) && !ehPrivado(p)) return p;
    }
    // So havia salto interno: melhor o ultimo valido que nada.
    for (let i = partes.length - 1; i >= 0; i--) {
      if (ehEndereco(partes[i]!)) return partes[i]!;
    }
  }

  const real = ler(cabecalhos, "x-real-ip")?.trim();
  if (real && ehEndereco(real)) return real;
  return null;
}

/**
 * A chave de limite de taxa para esta origem.
 *
 * Quem nao tem origem legivel cai TODO em uma chave so. E de proposito: se
 * cada chamada sem origem ganhasse uma chave propria, nao ter origem seria o
 * caminho para escapar do teto — exatamente o buraco que esta correcao fecha.
 */
export function chaveDeOrigem(
  cabecalhos: Cabecalhos | Record<string, unknown> | undefined,
): string {
  return ipDeQuemChamou(cabecalhos) ?? SEM_ORIGEM;
}
