# Importacao de clientes por planilha

Para migrar de um sistema que nao conhecemos: quase todo sistema juridico
exporta para Excel ou CSV. Em **Clientes > Importar planilha** (administrador)
ou, na implantacao pela plataforma, em **Clientes do sistema anterior**.

## Os quatro passos

1. **A planilha**: `.xlsx` ou `.csv`, uma linha por cliente, titulos na
   primeira linha. Ate 5 mil linhas e 10 MB. O `.xls` antigo e recusado com a
   instrucao de salvar como `.xlsx` (um clique no Excel).
2. **As colunas**: o sistema sugere para onde vai cada coluna pelos titulos
   que os sistemas usam ("Nome do Cliente", "CPF/CNPJ", "Celular", "Dt.
   Nascimento", "Municipio"...), com tres exemplos de cada. Quem importa
   confere e corrige; o que nao interessa fica em "nao importar".
3. **A conferencia**, sem gravar nada: cada linha sai como **Novo**, **Ja
   cadastrado**, **Repetido na planilha** ou **Com problema**, com o motivo e
   os avisos. O relatorio baixa em CSV.
4. **Importar**: entram so os novos, num lote registrado que pode ser
   **desfeito**.

## As regras

- **Na duvida, nao grava.** CPF/CNPJ que nao fecha o digito, ou numero que o
  Excel transformou em notacao cientifica (`1,12E+13`): a linha vai para o
  relatorio, nunca entra "consertada".
- **O zero que o Excel comeu**: CPF, CNPJ ou CEP que vieram como numero e
  perderam o zero da frente sao devolvidos **so** se o documento entao fechar
  o digito (CEP: se ficar com 8 digitos). A linha leva o aviso.
- **Campo acessorio ruim nao derruba o cliente**: e-mail sem @, telefone sem
  DDD, data impossivel, UF que nao existe — o campo fica de fora, com aviso, e
  o cliente entra. So nome ausente e documento invalido barram.
- **Ja cadastrado** pelo CPF/CNPJ; sem documento na planilha, pelo nome.
  Planilha com CPF de alguem que aqui esta cadastrado so pelo nome (sem CPF)
  tambem conta como ja cadastrado — o caminho e completar o CPF na ficha, nao
  criar um segundo cadastro.
- **Importar de novo a mesma planilha nao duplica**: quem entrou na primeira
  vez aparece como ja cadastrado.
- **Desfazer** apaga os clientes do lote que ainda nao tem nada ligado
  (processo, cobranca, documento, compromisso, contrato, prazo, tarefa,
  entrevista, representante). Os outros ficam, e a tela diz quantos.
- **O arquivo nao e guardado.** Tem dados pessoais e ja cumpriu o papel. Fica
  o registro: quem, quando, nome do arquivo e as contagens.
- Clientes novos ganham pasta na nuvem do escritorio, se houver uma conectada.

## Campos

Nome, CPF/CNPJ, e-mail, telefone, RG, data de nascimento, nacionalidade,
estado civil, profissao, endereco (CEP, rua, numero, complemento, bairro,
cidade, UF — ou uma coluna so com o endereco completo) e observacoes.

## Qualificacao do cliente (migracao 49)

O cliente pessoa fisica ganhou RG, data de nascimento, nacionalidade, estado
civil, profissao e observacoes, editaveis na ficha junto com o endereco (que
antes nao era editavel). A procuracao e o contrato passam a sair assim:

> Ana Paula Martins, brasileira, casada, professora, portadora do RG nº
> 12.345.678-9, inscrita no CPF sob o nº ..., com endereco em ...

No feminino quando a propria pessoa escreveu "brasileira" ou "casada" — nunca
pelo nome. Sem esses campos, o texto e o de antes. Novas marcacoes de modelo:
`{{cliente.rg}}`, `{{cliente.nascimento}}`, `{{cliente.nacionalidade}}`,
`{{cliente.estado_civil}}`, `{{cliente.profissao}}`.

## Onde esta no codigo

- `src/lib/planilha.ts` — leitor de .xlsx (pelo ZIP, sem biblioteca de planilha) e .csv
- `src/lib/importacao-clientes.ts` — mapeamento, interpretacao e classificacao (puro)
- `src/lib/importacao-do-escritorio.ts` — analisar, importar, desfazer
- `src/lib/rota-de-importacao.ts`, `src/app/api/clientes/importar`, `src/app/api/plataforma/escritorios/[id]/importar`
- `src/componentes/ImportadorDeClientes.tsx`
- testes: `testes/importacao-clientes.test.ts`, com um .xlsx montado no teste
