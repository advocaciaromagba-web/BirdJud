import { NextResponse } from "next/server";
import { buscarCep, digitosDoCep } from "@/lib/cep";
import { registrarTentativa } from "@/lib/limite";
import { ipDeQuemChamou } from "@/lib/origem";

export const dynamic = "force-dynamic";

/**
 * O endereco de um CEP. Aberto (o cadastro publico de escritorio tambem pode
 * usar), mas com teto por origem: sem ele, isto viraria um proxy gratuito de
 * consulta de CEP para quem quisesse.
 */
export async function GET(req: Request, { params }: { params: Promise<{ cep: string }> }) {
  const cep = digitosDoCep((await params).cep);
  if (!cep) return NextResponse.json({ erro: "O CEP tem 8 digitos." }, { status: 400 });

  const origem = ipDeQuemChamou(req.headers) ?? "sem-origem";
  const limite = await registrarTentativa(`cep:${origem}`, 120, 60 * 60);
  if (!limite.permitido) {
    return NextResponse.json({ erro: "Muitas consultas de CEP. Tente daqui a pouco." }, { status: 429 });
  }

  const endereco = await buscarCep(cep);
  if (!endereco) {
    return NextResponse.json({ erro: "CEP nao encontrado. Confira os numeros ou preencha o endereco a mao." }, { status: 404 });
  }
  return NextResponse.json({ endereco }, { headers: { "cache-control": "private, max-age=86400" } });
}
