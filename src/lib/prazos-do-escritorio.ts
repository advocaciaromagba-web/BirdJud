// Prazos, do lado do banco.
//
// O calculo mora em prazos.ts, puro e testado. Aqui so se busca o calendario
// do escritorio, se grava e se le — a separacao e de proposito: a aritmetica
// que nao pode errar nao depende de banco para ser testada.
import { comEscritorio, semEscritorio } from "./prisma";
import {
  type Contagem,
  calcularPrazo,
  diasUteisAte,
  type PrazoCalculado,
} from "./prazos";
import { diaEmBrasilia } from "./datas";

/** Quantos dias uteis antes do vencimento o prazo vira urgente. */
export const AVISO_EM_DIAS = 3;

/** Hoje, em AAAA-MM-DD, no fuso de Brasilia. */
export function hoje(): string {
  return diaEmBrasilia(new Date());
}

/**
 * Os dias sem expediente do escritorio, como o calculo espera.
 *
 * Busca a janela inteira de uma vez em vez de dia a dia: um prazo de 100 dias
 * uteis atravessa meses, e uma consulta por dia seria uma consulta por dia.
 */
export async function calendarioDoEscritorio(
  escritorioId: string,
): Promise<Set<string>> {
  const dias = await comEscritorio(escritorioId, (db) =>
    db.diaSemExpediente.findMany({ select: { dia: true } }),
  );
  return new Set(dias.map((d) => d.dia.toISOString().slice(0, 10)));
}

/** Converte AAAA-MM-DD para a data que o banco guarda como DATE. */
function comoData(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export type NovoPrazo = {
  titulo: string;
  termoInicial: string;
  dias: number;
  contagem?: Contagem;
  processoId?: string | null;
  clienteId?: string | null;
  responsavelId?: string | null;
  observacao?: string | null;
};

/**
 * Calcula e grava.
 *
 * O RESULTADO FICA GRAVADO, nao recalculado na leitura. O calendario do
 * escritorio muda — alguem cadastra um feriado municipal depois —, e prazo ja
 * comunicado ao cliente nao pode mudar de data sozinho. Quem quiser a conta
 * nova refaz o prazo de proposito.
 */
export async function registrarPrazo(
  escritorioId: string,
  dados: NovoPrazo,
): Promise<{ id: string; calculo: PrazoCalculado }> {
  const calendario = await calendarioDoEscritorio(escritorioId);
  const calculo = calcularPrazo(
    dados.termoInicial,
    dados.dias,
    dados.contagem ?? "UTEIS",
    calendario,
  );

  const prazo = await comEscritorio(escritorioId, (db) =>
    db.prazo.create({
      // A extensao injeta o escritorio; semEscritorio so conta isso ao
      // TypeScript. O id nunca vem do corpo da requisicao.
      data: semEscritorio({
        titulo: dados.titulo.trim(),
        termoInicial: comoData(dados.termoInicial),
        dias: dados.dias,
        contagem: dados.contagem ?? "UTEIS",
        inicioContagem: comoData(calculo.inicioContagem),
        vencimento: comoData(calculo.vencimento),
        explicacao: calculo.explicacao,
        processoId: dados.processoId ?? null,
        clienteId: dados.clienteId ?? null,
        responsavelId: dados.responsavelId ?? null,
        observacao: dados.observacao?.trim() || null,
      }),
      select: { id: true },
    }),
  );
  return { id: prazo.id, calculo };
}

export type Urgencia = "VENCIDO" | "HOJE" | "URGENTE" | "EM_CURSO";

/**
 * Quao perto esta o vencimento.
 *
 * Em DIAS UTEIS, nao corridos: um prazo que vence na segunda-feira, visto numa
 * sexta, tem UM dia util pela frente, nao tres. Contar corrido aqui daria ao
 * advogado a sensacao de folga que ele nao tem.
 */
export function urgenciaDoPrazo(
  vencimentoISO: string,
  hojeISO: string,
  calendario?: ReadonlySet<string>,
): { urgencia: Urgencia; diasUteis: number } {
  if (vencimentoISO === hojeISO) return { urgencia: "HOJE", diasUteis: 0 };
  const diasUteis = diasUteisAte(hojeISO, vencimentoISO, calendario);
  if (diasUteis < 0) return { urgencia: "VENCIDO", diasUteis };
  if (diasUteis <= AVISO_EM_DIAS) return { urgencia: "URGENTE", diasUteis };
  return { urgencia: "EM_CURSO", diasUteis };
}
