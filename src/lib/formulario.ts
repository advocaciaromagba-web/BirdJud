// Arquivo que chegou por multipart/form-data.
//
// Existe por um motivo especifico: `instanceof File` **quebra em producao**.
// O `File` global so existe a partir do Node 20, e a imagem do provedor
// estava no 18 — a rota de leitura por IA respondia 500 com
// "ReferenceError: File is not defined", enquanto no computador de
// desenvolvimento, no Node 22, passava.
//
// A checagem por formato (tem nome, tem tamanho, sabe virar bytes) e a mesma
// coisa e nao depende de qual Node esta rodando. E o tipo declarado aqui e o
// que as rotas usam, no lugar do File do navegador.
export type ArquivoEnviado = {
  name: string;
  size: number;
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export function ehArquivoEnviado(valor: unknown): valor is ArquivoEnviado {
  return (
    typeof valor === "object" &&
    valor !== null &&
    "arrayBuffer" in valor &&
    typeof (valor as ArquivoEnviado).arrayBuffer === "function" &&
    typeof (valor as ArquivoEnviado).name === "string" &&
    typeof (valor as ArquivoEnviado).size === "number"
  );
}

/** Todos os arquivos enviados sob um mesmo campo do formulario. */
export function arquivosDoCampo(
  formulario: FormData,
  campo: string,
): ArquivoEnviado[] {
  // O laco explicito evita a briga de tipos entre FormDataEntryValue (File |
  // string) e o formato declarado aqui, que de proposito nao e o File.
  const arquivos: ArquivoEnviado[] = [];
  for (const item of formulario.getAll(campo)) {
    if (ehArquivoEnviado(item)) arquivos.push(item);
  }
  return arquivos;
}
