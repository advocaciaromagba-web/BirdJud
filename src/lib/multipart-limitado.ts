/** Le um corpo multipart com teto antes de invocar o parser de formData(). */
export class CorpoGrandeDemais extends Error {
  readonly status = 413;
}

export async function formularioLimitado(req: Request, maximoBytes: number): Promise<FormData> {
  const tamanho = req.headers.get("content-length");
  if (tamanho && Number(tamanho) > maximoBytes) throw new CorpoGrandeDemais();
  if (!req.body) return req.formData();

  const leitor = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await leitor.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximoBytes) {
        await leitor.cancel();
        throw new CorpoGrandeDemais();
      }
      partes.push(value);
    }
  } finally {
    leitor.releaseLock();
  }

  // O corpo ja esta limitado. O parser so recebe os bytes aceitos.
  const corpo = Buffer.concat(partes.map((parte) => Buffer.from(parte)), total);
  return new Request(req.url, {
    method: "POST",
    headers: { "content-type": req.headers.get("content-type") ?? "" },
    body: corpo,
  }).formData();
}
