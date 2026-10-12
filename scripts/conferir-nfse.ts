// Confere a NFS-e de um escritorio contra a HOMOLOGACAO da Sefin Nacional.
//
//   NFSE_SENHA='...' npm run conferir-nfse -- <slug-do-escritorio> [--emitir]
//
// A senha do certificado NAO fica guardada no sistema, por isso vem do
// ambiente (e nao da linha de comando, que fica no historico do terminal).
//
// Sem --emitir: abre o certificado, confere o CNPJ e consulta o convenio do
// municipio com TLS mutuo — prova certificado, conexao e municipio.
// Com --emitir: monta, assina e manda uma DPS de R$ 1,00 para a homologacao,
// com o cadastro fiscal do escritorio, e imprime o que voltou.
//
// Nota de homologacao nao tem valor fiscal e nao gera ISS.
import { comEscritorio, prismaPlataforma } from "../src/lib/prisma";
import { certificadoGuardado } from "../src/lib/nfse/emissao";
import { carregarDeBase64 } from "../src/lib/nfse/certificado";
import { assinarXml } from "../src/lib/nfse/assinar";
import { montarDps } from "../src/lib/nfse/dps";
import { consultarConvenio, enviarDps } from "../src/lib/nfse/api";
import { ibsCbsVigente, regimeVigente } from "../src/lib/nfse/regime";

async function main(): Promise<void> {
  const [slug, ...opcoes] = process.argv.slice(2);
  const senha = process.env.NFSE_SENHA ?? "";
  if (!slug || !senha) {
    console.error("Uso: NFSE_SENHA='...' npm run conferir-nfse -- <slug-do-escritorio> [--emitir]");
    process.exit(1);
  }

  const escritorio = await prismaPlataforma().escritorio.findFirstOrThrow({ where: { slug } });
  const fiscal = await comEscritorio(escritorio.id, (db) => db.fiscal.findFirst());
  if (!fiscal) {
    console.error("Este escritorio ainda nao tem cadastro fiscal.");
    process.exit(1);
  }
  const guardado = await certificadoGuardado(escritorio.id);
  if (!guardado) {
    console.error("Este escritorio ainda nao enviou o certificado.");
    process.exit(1);
  }
  const cert = carregarDeBase64(guardado.arquivo, senha);
  console.log(`Certificado: ${cert.titular} (CNPJ ${cert.cnpj ?? "e-CPF"}), valido ate ${cert.validoAte.toLocaleDateString("pt-BR")}`);
  if (cert.cnpj !== fiscal.cnpj.replace(/\D/g, "")) console.warn("ATENCAO: o CNPJ do certificado e diferente do cadastro fiscal (E0718).");

  const convenio = await consultarConvenio("HOMOLOGACAO", fiscal.codigoMunicipio, cert);
  console.log(`Convenio do municipio ${fiscal.codigoMunicipio}: HTTP ${convenio.status}`, convenio.parametros ?? convenio.mensagem);

  if (!opcoes.includes("--emitir")) return;

  const agora = new Date();
  const { xml } = montarDps(
    {
      cnpj: fiscal.cnpj,
      inscricaoMunicipal: fiscal.inscricaoMunicipal,
      codigoMunicipio: fiscal.codigoMunicipio,
      telefone: fiscal.telefone,
      email: fiscal.email,
      ...regimeVigente(fiscal, agora),
      codigoTributacaoNacional: fiscal.codigoTributacao,
      codigoNbs: fiscal.codigoNbs,
      ibsCbs: ibsCbsVigente(fiscal, agora),
    },
    {
      ambiente: "HOMOLOGACAO",
      serie: "99",
      numero: Math.floor(Date.now() / 1000) % 1_000_000,
      dataEmissao: new Date(Date.now() - 60_000),
      dataCompetencia: agora.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }),
      tomador: { documento: "52998224725", nome: "TOMADOR DE TESTE", email: null, telefone: null, endereco: null },
      descricao: "Teste de homologacao — sem valor fiscal",
      valorCentavos: 100,
      informacoesComplementares: null,
    },
  );
  console.log("--- DPS ---\n" + xml + "\n");
  const r = await enviarDps("HOMOLOGACAO", assinarXml(xml, "infDPS", cert), cert);
  if (r.ok) {
    console.log("--- ACEITA ---\nchave:", r.chaveAcesso);
    if (r.alertas.length) console.log("alertas:", r.alertas);
  } else {
    console.error("--- RECUSADA ---");
    for (const e of r.erros) console.error(`${e.codigo} ${e.descricao}${e.complemento ? ` (${e.complemento})` : ""}`);
    process.exit(1);
  }
}

main().then(
  () => process.exit(0),
  (erro) => {
    console.error("Falha:", erro.message);
    process.exit(1);
  },
);
