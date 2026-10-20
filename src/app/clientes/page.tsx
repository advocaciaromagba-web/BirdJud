import Link from "next/link";
import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { modulosAtivos } from "@/lib/modulos";
import { Estrutura } from "@/componentes/Estrutura";
import { FormularioCriar } from "@/componentes/FormularioCriar";
import { pendenciasDoCliente, quantasImpedem } from "@/lib/clientes";

export default async function PaginaClientes() {
  const contexto = await contextoDaPagina(undefined, "CLIENTES");

  const modulos = await modulosAtivos(contexto.escritorioId);
  const clientes = await comEscritorio(contexto.escritorioId, (db) =>
    db.cliente.findMany({
      orderBy: { nome: "asc" },
      take: 200,
      include: {
        _count: {
          select: {
            processos: true,
            arquivos: true,
            itensDeChecklist: { where: { essencial: true, entregueEm: null } },
          },
        },
      },
    }),
  );

  return (
    <Estrutura
      nomeEscritorio={contexto.marca.nome}
      logoUrl={contexto.marca.logoUrl}
      papel={contexto.papel}
      nomeUsuario={contexto.nomeUsuario}
      acesso={contexto.acesso}
      modulos={modulos}
      titulo="Clientes"
      chamada={`${clientes.length} cadastrado(s).`}
    >
      {contexto.papel === "ADMIN" ? (
        <div className="mb-3 flex justify-end">
          <Link href="/clientes/importar" className="botao-secundario">
            Importar planilha
          </Link>
        </div>
      ) : null}
      <FormularioCriar
        rota="/api/clientes"
        recolhivel
        textoAbrir="Novo cliente"
        textoBotao="Cadastrar cliente"
        leitura={modulos.includes("IA") ? "CLIENTE" : undefined}
        campos={[
          { nome: "nome", rotulo: "Nome", obrigatorio: true, largo: true },
          { nome: "documento", rotulo: "CPF / CNPJ" },
          { nome: "telefone", rotulo: "Telefone" },
          { nome: "email", rotulo: "E-mail", tipo: "email" },

          // Qualificacao: e o que vai na procuracao e na inicial. A leitura
          // do documento de identidade preenche estes sozinha.
          { nome: "rg", rotulo: "RG / CIN" },
          { nome: "nascimento", rotulo: "Nascimento", tipo: "date" },
          { nome: "nacionalidade", rotulo: "Nacionalidade" },
          { nome: "estadoCivil", rotulo: "Estado civil" },
          { nome: "profissao", rotulo: "Profissão" },

          // Endereco: o CEP primeiro, e o resto vem sozinho — falta o numero.
          {
            nome: "cep",
            rotulo: "CEP",
            tipo: "cep",
            preenche: { logradouro: "logradouro", bairro: "bairro", cidade: "cidade", uf: "uf" },
            focoDepois: "numero",
            ajuda: "Digite o CEP: rua, bairro, cidade e UF se preenchem sozinhos.",
          },
          { nome: "logradouro", rotulo: "Rua / avenida" },
          { nome: "numero", rotulo: "Número" },
          { nome: "complemento", rotulo: "Complemento" },
          { nome: "bairro", rotulo: "Bairro" },
          { nome: "cidade", rotulo: "Cidade" },
          { nome: "uf", rotulo: "UF" },

          // Honorarios no mesmo gesto. Tudo opcional: cliente entra antes de
          // haver contrato, e obrigar o valor aqui faria alguem inventar um
          // numero so para conseguir cadastrar.
          {
            nome: "honDescricao",
            rotulo: "Honorários — sobre o que",
            largo: true,
            ajuda:
              "Preencha daqui para baixo só se já houver contratação. Valor fixo, " +
              "percentual de êxito, ou os dois.",
          },
          { nome: "honValor", rotulo: "Valor total (R$)" },
          {
            nome: "honEntrada",
            rotulo: "Entrada (R$)",
            ajuda: "Para a vista mais parcelamento. Em branco, não há entrada.",
          },
          {
            nome: "honParcelas",
            rotulo: "Parcelas",
            ajuda: "Em quantas vezes o que sobra depois da entrada. 1 é à vista.",
          },
          { nome: "honPercentual", rotulo: "Êxito (%)" },
          {
            nome: "honPrimeiroVencimento",
            rotulo: "1o vencimento",
            tipo: "date",
          },
          {
            nome: "honForma",
            rotulo: "Forma",
            tipo: "select",
            opcoes: [
              { valor: "BOLETO", rotulo: "Boleto" },
              { valor: "PIX", rotulo: "Pix" },
              { valor: "CARTAO", rotulo: "Cartão" },
              { valor: "QUALQUER", rotulo: "O cliente escolhe" },
            ],
          },
        ]}
      />
      {/*
        Só o nome é obrigatório, e vale dizer na tela: documento de
        identificação hoje é o CPF, e RG não é exigido em lugar nenhum. Quem
        não sabe disso deixa de cadastrar o cliente por não ter o papel a mão.
      */}
      <p className="ajuda mt-2">
        Só o nome é obrigatório. O resto pode entrar depois — a ficha de cada
        cliente mostra o que falta e o que aquilo atrapalha.
      </p>

      {clientes.length === 0 ? (
        <p className="vazio mt-6">
          Nenhum cliente cadastrado ainda. Comece pelo botão acima — depois cada
          processo, cobrança e arquivo se pendura no cliente.
        </p>
      ) : (
        <div className="cartao mt-6 overflow-x-auto p-0">
          <table className="tabela">
            <thead>
              <tr>
                <th>Nome</th>
                <th>CPF / CNPJ</th>
                <th>Contato</th>
                <th>Cadastro</th>
                <th className="text-right">Processos</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((cliente) => {
                const pendencias = pendenciasDoCliente(cliente, modulos, {
                  arquivos: cliente._count.arquivos,
                  essenciaisPendentes: cliente._count.itensDeChecklist,
                });
                const impedem = quantasImpedem(pendencias);
                return (
                  <tr key={cliente.id}>
                    <td className="font-medium">
                      {/*
                        Vai para a FICHA, não para a busca. Era a busca que
                        abria antes, e de lá não dava para editar nada.
                      */}
                      <Link
                        href={`/clientes/${cliente.id}`}
                        className="hover:underline"
                      >
                        {cliente.nome}
                      </Link>
                    </td>
                    <td className="text-slate-600">
                      {cliente.documento ?? "—"}
                    </td>
                    <td className="text-slate-600">
                      {[cliente.telefone, cliente.email]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td className="text-sm">
                      {impedem > 0 ? (
                        <span className="text-red-700">
                          {impedem} pendencia(s) que impedem
                        </span>
                      ) : pendencias.length > 0 ? (
                        <span className="text-amber-700">
                          {pendencias.length} a completar
                        </span>
                      ) : (
                        <span className="text-slate-500">completo</span>
                      )}
                    </td>
                    <td className="text-right tabular-nums">
                      {cliente._count.processos}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Estrutura>
  );
}
