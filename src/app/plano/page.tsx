import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { usoDaFaixa } from "@/lib/faixas";
import { emReais } from "@/lib/dinheiro";
import { dataBR } from "@/lib/datas";
import { PRECO_DO_MODULO } from "@/lib/precos";
import {
  contaMontada,
  MODULOS_COBRAVEIS,
  PLANO,
  planoExato,
} from "@/lib/planos";
import { ROTULO_DO_MODULO } from "@/lib/rotulos";
import { Estrutura } from "@/componentes/Estrutura";
import type { Modulo } from "@/lib/catalogo";

export default async function PaginaDoPlano() {
  // Plano e contrato: quem ve e quem responde pelo escritorio.
  const contexto = await contextoDaPagina();
  const modulos = await modulosAtivos(contexto.escritorioId);

  if (contexto.papel !== "ADMIN") {
    return (
      <Estrutura
        nomeEscritorio={contexto.marca.nome}
        logoUrl={contexto.marca.logoUrl}
        papel={contexto.papel}
        modulos={modulos}
        titulo="Plano"
      >
        <p className="vazio">
          O plano do escritorio e visto por quem administra a conta.
        </p>
      </Estrutura>
    );
  }

  const [uso, assinatura] = await Promise.all([
    usoDaFaixa(contexto.escritorioId),
    comEscritorio(contexto.escritorioId, (db) => db.assinatura.findFirst()),
  ]);

  const contratados = modulos.filter(
    (modulo): modulo is Modulo => modulo !== "NUCLEO",
  );
  const plano = planoExato(contratados);
  const conta = contaMontada(contratados, uso.faixa);
  const faltando = MODULOS_COBRAVEIS.filter(
    (modulo) => !contratados.includes(modulo),
  );

  // O que vale e o valor fechado na assinatura; a tabela pode ter mudado
  // depois, e contrato assinado nao muda por isso.
  const mensalidade = assinatura?.valorCentavos ?? conta.totalCentavos;
  const emTeste = assinatura
    ? assinatura.fimDoTeste.getTime() > Date.now()
    : false;

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      modulos={modulos}
      titulo="Plano do escritorio"
      chamada={
        plano
          ? `Plano ${PLANO[plano].rotulo}.`
          : "Plano montado para este escritorio."
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="indicador">
          <p className="indicador-numero">{emReais(mensalidade)}</p>
          <p className="indicador-rotulo">Mensalidade contratada</p>
        </section>
        <section className="indicador">
          <p className="indicador-numero">
            {uso.advogados.usados}/{uso.advogados.limite}
          </p>
          <p className="indicador-rotulo">
            Advogados ativos · faixa {uso.rotulo}
          </p>
        </section>
        <section className="indicador">
          <p className="indicador-numero">
            {uso.apoio.usados}/{uso.apoio.limite}
          </p>
          <p className="indicador-rotulo">Equipe de apoio ativa</p>
        </section>
      </div>

      {emTeste && assinatura ? (
        <p className="aviso-info mt-4">
          Periodo de teste ate {dataBR.format(assinatura.fimDoTeste)}. A
          primeira fatura so e gerada depois disso.
        </p>
      ) : null}

      <section className="mt-8">
        <h2>O que esta contratado</h2>
        <div className="cartao mt-3 overflow-x-auto p-0">
          <table className="tabela">
            <thead>
              <tr>
                <th>Modulo</th>
                <th className="text-right">Na tabela de hoje</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span className="font-medium">Sistema</span>
                  <span className="block text-slate-500">
                    Clientes, processos, agenda e prazos · ate{" "}
                    {uso.advogados.limite} advogados
                  </span>
                </td>
                <td className="text-right tabular-nums">
                  {emReais(conta.faixaCentavos)}
                </td>
              </tr>
              {conta.modulos.map((linha) => (
                <tr key={linha.modulo}>
                  <td className="font-medium">
                    {ROTULO_DO_MODULO[linha.modulo]}
                  </td>
                  <td className="text-right tabular-nums">
                    {emReais(linha.valorCentavos)}
                  </td>
                </tr>
              ))}
              {conta.descontoCentavos > 0 && conta.plano ? (
                <tr>
                  <td className="destaque">
                    Desconto do plano {PLANO[conta.plano].rotulo}
                  </td>
                  <td className="destaque text-right tabular-nums">
                    − {emReais(conta.descontoCentavos)}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="ajuda">
          Esta coluna e a tabela vigente. O que o escritorio paga e o valor
          fechado na assinatura, acima — mudanca de tabela nao altera contrato
          assinado.
        </p>
      </section>

      {faltando.length > 0 ? (
        <section className="mt-8">
          <h2>O que da para acrescentar</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {faltando.map((modulo) => (
              <li
                key={modulo}
                className="cartao-aperto flex items-baseline justify-between gap-3"
              >
                <span className="font-medium">{ROTULO_DO_MODULO[modulo]}</span>
                <span className="shrink-0 text-sm text-slate-500">
                  + {emReais(PRECO_DO_MODULO[modulo] ?? 0)}/mes
                </span>
              </li>
            ))}
          </ul>
          <p className="ajuda">
            Contratar ou cancelar modulo e mudanca de contrato: fale com quem
            atende o escritorio na plataforma. O sistema nao liga modulo
            sozinho.
          </p>
        </section>
      ) : (
        <p className="aviso-ok mt-8">
          Este escritorio esta no plano mais completo: todos os modulos da
          plataforma estao contratados.
        </p>
      )}
    </Estrutura>
  );
}
