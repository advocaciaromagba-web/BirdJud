// Leitura simples do XML da NFS-e autorizada (e da DPS dentro dela), por
// caminho de nomes de elemento — suficiente para o DANFSe e para guardar
// numero/chave, sem depender de prefixo de namespace.
import { DOMParser } from "@xmldom/xmldom";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XElement = any;

export type NoXml = {
  txt: (caminho: string) => string | null;
  no: (caminho: string) => NoXml | null;
  existe: (caminho: string) => boolean;
  atributo: (nome: string) => string | null;
};

function filhoDireto(el: XElement, nome: string): XElement | null {
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && ((n as XElement).localName ?? (n as XElement).nodeName) === nome) return n as XElement;
  }
  return null;
}

function embrulhar(el: XElement): NoXml {
  const achar = (caminho: string): XElement | null => {
    let atual: XElement | null = el;
    for (const parte of caminho.split("/").filter(Boolean)) {
      if (!atual) return null;
      atual = filhoDireto(atual, parte);
    }
    return atual;
  };
  return {
    txt: (c) => {
      const e = achar(c);
      const t = e?.textContent?.trim();
      return t ? t : null;
    },
    no: (c) => {
      const e = achar(c);
      return e ? embrulhar(e) : null;
    },
    existe: (c) => !!achar(c),
    atributo: (nome) => el.getAttribute(nome) || null,
  };
}

/** Raiz <NFSe> -> devolve o no <infNFSe>. */
export function lerNfse(xml: string): NoXml {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const raiz = doc.documentElement as unknown as XElement;
  const inf = filhoDireto(raiz, "infNFSe");
  if (!inf) throw new Error("XML da NFS-e sem o grupo infNFSe.");
  return embrulhar(inf);
}
