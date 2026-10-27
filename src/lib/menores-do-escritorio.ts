// Menor cadastrado a partir de quem o representa (27/10/2026, vindo da Roma).
//
// O caminho real no escritorio: chega a mae, vira cliente, e so depois se ve
// que quem figura na acao e o filho. O menor nasce do cadastro dela, ligado a
// ele, e ela ja entra como quem o representa — ninguem redigita.
//
// RG e CPF NAO sao herdados, de proposito: documento e pessoal, e herdar
// faria a procuracao do menor sair com o RG da mae — erro grave que passa
// despercebido justamente por parecer preenchido.
import type { Prisma } from "@prisma/client";
import { comEscritorio, semEscritorio } from "./prisma";
import { cpfValido, digitosDe } from "./documentos";
import { ehPessoaJuridica } from "./representantes";
import { ehParentesco, problemaDoMenor, type Parentesco } from "./menor";

export class MenorRecusado extends Error {
  readonly status = 400;
  constructor(motivo: string) {
    super(motivo);
    this.name = "MenorRecusado";
  }
}

export type NovoMenor = {
  nome: string;
  /** aaaa-mm-dd */
  nascimento: string;
  parentesco: Parentesco | string;
  documento?: string | null;
  rg?: string | null;
  nacionalidade?: string | null;
};

export async function cadastrarMenor(escritorioId: string, adultoId: string, m: NovoMenor, hoje = new Date()) {
  const nome = m.nome.trim();
  if (nome.length < 2) throw new MenorRecusado("Informe o nome do menor.");
  if (!ehParentesco(m.parentesco)) throw new MenorRecusado("Escolha o parentesco de quem representa.");
  const dia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(m.nascimento.trim());
  const nascimento = dia ? new Date(Date.UTC(Number(dia[1]), Number(dia[2]) - 1, Number(dia[3]), 12)) : null;
  if (!nascimento || Number.isNaN(nascimento.getTime()) || nascimento > hoje) {
    throw new MenorRecusado("Data de nascimento inválida.");
  }
  const problema = problemaDoMenor(nascimento, hoje);
  if (problema) throw new MenorRecusado(problema);

  const documento = m.documento?.trim() ? digitosDe(m.documento) : null;
  if (documento && (documento.length !== 11 || !cpfValido(documento))) {
    throw new MenorRecusado("O CPF do menor não fecha o dígito verificador.");
  }

  const adulto = await comEscritorio(escritorioId, (db) => db.cliente.findFirst({ where: { id: adultoId } }));
  if (!adulto) throw new MenorRecusado("Cliente não encontrado.");
  if (adulto.menor) throw new MenorRecusado("Este cadastro já é de um menor: o menor nasce do cadastro de quem o representa.");
  if (ehPessoaJuridica(adulto.documento)) throw new MenorRecusado("Empresa não exerce poder familiar: cadastre o menor a partir da mãe, do pai ou do responsável.");
  if (!adulto.documento || !cpfValido(adulto.documento)) {
    throw new MenorRecusado(`Preencha o CPF de ${adulto.nome} antes: ele vai na qualificação de quem representa o menor.`);
  }
  if (documento && digitosDe(adulto.documento) === documento) {
    throw new MenorRecusado("O CPF informado é o do responsável, não o do menor.");
  }

  return comEscritorio(escritorioId, async (db) => {
    const menor = await db.cliente.create({
      data: semEscritorio({
        nome,
        documento,
        rg: m.rg?.trim() || null,
        nascimento,
        nacionalidade: m.nacionalidade?.trim() || null,
        menor: true,
        responsavelClienteId: adulto.id,
        // Contato e endereco sao de quem cuida do menor: os avisos vao para la.
        email: adulto.email,
        telefone: adulto.telefone,
        notificarWhatsapp: adulto.notificarWhatsapp,
        notificarEmail: adulto.notificarEmail,
        endereco: (adulto.endereco ?? undefined) as Prisma.InputJsonValue | undefined,
      }),
    });
    await db.representante.create({
      data: semEscritorio({
        clienteId: menor.id,
        ordem: 0,
        nome: adulto.nome,
        cpf: adulto.documento!,
        rg: adulto.rg,
        nacionalidade: adulto.nacionalidade,
        estadoCivil: adulto.estadoCivil,
        profissao: adulto.profissao,
        email: adulto.email,
        telefone: adulto.telefone,
        mesmoEnderecoDaEmpresa: true,
        parentesco: m.parentesco,
      }),
    });
    return menor;
  });
}
