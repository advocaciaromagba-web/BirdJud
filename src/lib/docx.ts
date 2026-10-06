// O .docx por dentro: abrir, trocar o texto, fechar.
//
// Um .docx e um zip. O texto vive em `word/document.xml`, e o do timbre em
// `word/header1.xml` e `word/footer1.xml`. Todo o resto — fonte, margem,
// estilo, imagem, numeracao — fica intocado. E de proposito: o papel e do
// escritorio, nos so preenchemos os campos.
import JSZip from "jszip";

export const CAMINHO_DO_TEXTO = "word/document.xml";

export class DocxInvalido extends Error {
  readonly status = 422;
  constructor(motivo: string) {
    super(motivo);
    this.name = "DocxInvalido";
  }
}

/**
 * As partes do .docx que tem texto do usuario.
 *
 * Nao e so `document.xml`: cabecalho e rodape sao arquivos proprios, e e
 * justamente onde mora o timbre. Campo esquecido no rodape sairia na peca
 * escrito como `{{...}}` — ou, pior, ninguem notaria.
 */
const PARTE_COM_TEXTO = /^word\/(document|header\d*|footer\d*)\.xml$/;

/** Le todas as partes com texto, por caminho. */
export async function lerTextos(arquivo: Buffer): Promise<Record<string, string>> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(arquivo);
  } catch {
    throw new DocxInvalido("O arquivo nao e um .docx: nao abriu como documento do Word.");
  }
  const nomes = Object.keys(zip.files).filter((n) => PARTE_COM_TEXTO.test(n));
  if (!nomes.includes(CAMINHO_DO_TEXTO)) {
    throw new DocxInvalido(
      "O arquivo nao e um .docx do Word. Se for .doc ou .odt, abra no Word e salve como .docx.",
    );
  }
  const partes: Record<string, string> = {};
  for (const nome of nomes) partes[nome] = await zip.file(nome)!.async("string");
  return partes;
}

/** Devolve o mesmo arquivo com varias partes trocadas de uma vez. */
export async function trocarTextos(
  arquivo: Buffer,
  partes: Record<string, string>,
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(arquivo, { createFolders: false });
  for (const [nome, xml] of Object.entries(partes)) {
    zip.file(nome, xml, { createFolders: false });
  }
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type Linha = {
  texto: string;
  negrito?: boolean;
  centro?: boolean;
  /** Paragrafo em branco depois desta linha. */
  espacoDepois?: boolean;
};

const TIPOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELACOES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const RELACOES_DO_TEXTO = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

function paragrafo(l: Linha): string {
  const alinhamento = l.centro ? '<w:jc w:val="center"/>' : '<w:jc w:val="both"/>';
  const estilo = l.negrito ? "<w:rPr><w:b/></w:rPr>" : "";
  const corpo =
    `<w:p><w:pPr>${alinhamento}</w:pPr>` +
    `<w:r>${estilo}<w:t xml:space="preserve">${escapar(l.texto)}</w:t></w:r></w:p>`;
  return l.espacoDepois ? `${corpo}<w:p/>` : corpo;
}

/**
 * Monta um .docx simples a partir de linhas.
 *
 * Serve aos modelos que ja vem no sistema — que o escritorio baixa, edita no
 * Word com o timbre dele e devolve. Nao e um editor: e o ponto de partida.
 */
export async function montarDocx(linhas: Linha[]): Promise<Buffer> {
  const zip = new JSZip();
  // Sem criar entrada de pasta: o Word e o LibreOffice recusam o arquivo
  // quando o zip traz "word/" como item proprio.
  const semPasta = { createFolders: false };
  zip.file("[Content_Types].xml", TIPOS, semPasta);
  zip.file("_rels/.rels", RELACOES, semPasta);
  zip.file("word/_rels/document.xml.rels", RELACOES_DO_TEXTO, semPasta);
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${linhas.map(paragrafo).join("")}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1134" w:bottom="1134" w:left="1701"/></w:sectPr>
</w:body></w:document>`,
    semPasta,
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
