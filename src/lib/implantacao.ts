// Implantacao pela plataforma: a Blackbird monta a conta do escritorio e a
// entrega pronta, testada, sem o escritorio precisar configurar nada.
//
// O que a plataforma FAZ por ele: cria o escritorio com plano, faixa e preco;
// preenche CNPJ, razao social, telefone e cores; inclui o administrador e a
// equipe (com OAB e celular); cadastra as OABs no DJEN; conecta e-mail,
// cobranca, assinatura e certificado — cada um testado no servico de verdade.
//
// O que a plataforma NAO faz, de proposito:
//   - a senha de entrar de cada pessoa: cada um escolhe a sua pelo convite;
//   - a senha de administracao: e a segunda chave do escritorio (financeiro,
//     certificado). Quem a conhece abre tudo; ela tem de ser so do escritorio.
//     E o primeiro passo do roteiro dele, um minuto;
//   - o aceite dos termos: e contrato, quem aceita e o administrador do
//     escritorio, no primeiro acesso;
//   - OneDrive e Google Drive: exigem entrar na conta do escritorio.
//
// Toda acao fica registrada como acesso de suporte, com o operador.
import { comEscritorio, prismaPlataforma } from "./prisma";
import { registrarAcessoSuporte } from "./plataforma";
import { nascerEscritorio, type Nascimento } from "./nascimento";
import { convidarPessoa, incluirPessoa, type NovaPessoa, type ResultadoDoConvite } from "./equipe";
import { salvarDadosDoEscritorio, type DadosDoEscritorio } from "./dados-do-escritorio";
import { adicionarOab, lerOab } from "./oabs";
import { moduloAtivo } from "./modulos";

export type Implantacao = Omit<Nascimento, "implantadoPor"> & {
  dados: DadosDoEscritorio;
  administrador: Omit<NovaPessoa, "papel" | "senha">;
};

/**
 * Advogado com OAB, em escritorio com DJEN: a OAB entra no monitoramento
 * sozinha. E a configuracao que mais se esquece, e sem ela nao chega
 * publicacao nenhuma.
 */
export async function monitorarOabDoAdvogado(escritorioId: string, oab: string | null | undefined) {
  const lida = lerOab(oab);
  if (!lida || !(await moduloAtivo(escritorioId, "PUBLICACOES_DJEN"))) return false;
  const ja = await comEscritorio(escritorioId, (db) =>
    db.oabMonitorada.findFirst({ where: { numero: lida.numero, uf: lida.uf }, select: { id: true } }),
  );
  if (ja) return false;
  await adicionarOab(escritorioId, lida);
  return true;
}

export async function implantarEscritorio(operador: { operadorId: string }, i: Implantacao) {
  const { escritorio, plano, mensalidadeCentavos } = await nascerEscritorio({
    slug: i.slug,
    nome: i.nome,
    modulos: i.modulos,
    faixa: i.faixa,
    diasDeTeste: i.diasDeTeste,
    valorCentavos: i.valorCentavos,
    implantadoPor: operador.operadorId,
  });
  await registrarAcessoSuporte(operador.operadorId, escritorio.id, "Implantacao: escritorio criado");

  await salvarDadosDoEscritorio(escritorio.id, i.dados);
  await incluirPessoa(escritorio.id, { ...i.administrador, papel: "ADMIN" });
  await monitorarOabDoAdvogado(escritorio.id, i.administrador.oab);

  return { id: escritorio.id, slug: escritorio.slug, plano, mensalidadeCentavos };
}

export async function incluirNaEquipe(operadorId: string, escritorioId: string, p: NovaPessoa) {
  await registrarAcessoSuporte(operadorId, escritorioId, `Implantacao: pessoa incluida (${p.papel})`);
  const pessoa = await incluirPessoa(escritorioId, p);
  const oabMonitorada = await monitorarOabDoAdvogado(escritorioId, p.oab);
  return { pessoa, oabMonitorada };
}

export type Entrega = {
  convites: ResultadoDoConvite[];
  entregueEm: Date;
};

/**
 * Entrega: manda o convite a quem ainda nao entrou e marca a conta como
 * entregue. Pode ser repetida — reenviar derruba o link anterior da pessoa.
 *
 * Quando o e-mail nao sai, o link volta para a tela do operador, uma vez, para
 * ele repassar por outro meio. Nao fica gravado em lugar nenhum.
 */
export async function entregarEscritorio(
  operador: { operadorId: string; nome: string },
  escritorioId: string,
): Promise<Entrega> {
  const escritorio = await prismaPlataforma().escritorio.findUniqueOrThrow({
    where: { id: escritorioId },
    select: { nome: true, slug: true },
  });
  await registrarAcessoSuporte(operador.operadorId, escritorioId, "Implantacao: entrega ao escritorio");

  const aguardando = await comEscritorio(escritorioId, (db) =>
    db.usuario.findMany({
      where: { ativo: true, ultimoAcesso: null },
      // Administrador primeiro: e ele quem aceita os termos e cria a senha
      // de administracao.
      orderBy: [{ papel: "asc" }, { criadoEm: "asc" }],
      select: { id: true },
    }),
  );

  const convites: ResultadoDoConvite[] = [];
  for (const u of aguardando) {
    convites.push(
      await convidarPessoa(escritorioId, u.id, {
        nomeDoEscritorio: escritorio.nome,
        slug: escritorio.slug,
        nomeDeQuemConvidou: `${operador.nome}, da Blackbird`,
      }),
    );
  }

  const entregueEm = new Date();
  await prismaPlataforma().escritorio.update({ where: { id: escritorioId }, data: { entregueEm } });
  return { convites, entregueEm };
}
