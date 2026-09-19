// Confere o layout da NFS-e contra a HOMOLOGACAO de verdade.
//
//   npm run conferir-nfse -- <slug-do-escritorio>
//
// O que ele faz: monta um DPS com o cadastro fiscal e o certificado do
// escritorio, assina, manda para a homologacao e imprime o que foi e o que
// voltou — inclusive o erro, campo a campo, quando a nota e recusada.
//
// E AQUI QUE A INCERTEZA DO MODULO SE FECHA. Enquanto este script nao rodar
// limpo, o layout em src/lib/nfse/layout.ts e o endereco em nacional.ts sao
// suposicoes escritas a partir da documentacao.
//
// Nota de homologacao nao tem valor fiscal e nao gera ISS.
import { comEscritorio, prismaPlataforma } from "../src/lib/prisma";
import { obterIntegracao } from "../src/lib/integracao";
import { abrirCertificado, assinarDps } from "../src/lib/nfse/assinatura";
import { idDaDps, montarDps, type DadosDaDps, type Regime } from "../src/lib/nfse/layout";
import { emitir } from "../src/lib/nfse/nacional";

async function main(): Promise<void> {
  const [slug] = process.argv.slice(2);
  if (!slug) {
    console.error("Uso: npm run conferir-nfse -- <slug-do-escritorio>");
    process.exit(1);
  }

  const escritorio = await prismaPlataforma().escritorio.findFirstOrThrow({ where: { slug } });
  const fiscal = await comEscritorio(escritorio.id, (db) => db.fiscal.findFirst());
  if (!fiscal) {
    console.error("Este escritorio ainda nao tem cadastro fiscal.");
    process.exit(1);
  }

  const credencial = await obterIntegracao<{ arquivo: string; senha: string }>(
    escritorio.id,
    "NFSE_CERT"
  );
  const certificado = abrirCertificado(credencial.arquivo, credencial.senha);
  console.log(`Certificado: ${certificado.titular}, valido ate ${certificado.validoAte.toLocaleDateString("pt-BR")}\n`);

  const dados: DadosDaDps = {
    serie: fiscal.serie,
    numero: fiscal.proximoNumero,
    emitidaEm: new Date(),
    prestador: {
      cnpj: fiscal.cnpj,
      inscricaoMunicipal: fiscal.inscricaoMunicipal,
      codigoMunicipio: fiscal.codigoMunicipio,
      regime: fiscal.regime as Regime,
    },
    tomador: { documento: "52998224725", nome: "TOMADOR DE TESTE", email: null },
    servico: {
      codigoTributacao: fiscal.codigoTributacao,
      descricao: "Teste de homologacao — sem valor fiscal",
      valorCentavos: 100,
      aliquotaMilesimos: fiscal.aliquotaMilesimos,
      issRetido: false,
      codigoMunicipioPrestacao: fiscal.codigoMunicipio,
    },
  };

  const xml = montarDps(dados, "HOMOLOGACAO");
  const assinado = assinarDps(xml, certificado, idDaDps(dados));

  console.log("--- DPS que vai subir ------------------------------------");
  console.log(xml);
  console.log("");

  try {
    const retorno = await emitir(assinado, "HOMOLOGACAO");
    console.log("--- ACEITO -----------------------------------------------");
    console.log("chave de acesso:", retorno.chaveAcesso);
    console.log("numero:", retorno.numero ?? "(nao veio)");
    console.log("pdf:", retorno.linkPdf ?? "(nao veio)");
    if (retorno.xml) console.log("\nNFS-e que voltou:\n", retorno.xml.slice(0, 2000));
  } catch (erro) {
    console.error("--- RECUSADO ---------------------------------------------");
    console.error((erro as Error).message);
    console.error(
      "\nCada campo reclamado aqui e um ponto a corrigir em src/lib/nfse/layout.ts."
    );
    process.exit(1);
  }
}

main().then(
  () => process.exit(0),
  (erro) => {
    console.error("Falha:", erro.message);
    process.exit(1);
  }
);
