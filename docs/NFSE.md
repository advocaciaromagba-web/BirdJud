# NFS-e (nota fiscal de servico)

Emissao pelo **Sistema Nacional da NFS-e** (Sefin Nacional), no metodo do
sistema da Advocacia Roma, que ja emite nota real em producao. Codigo em
`src/lib/nfse/`.

## O fluxo: preparar, depois assinar

1. **Preparar** (qualquer pessoa com acesso a Notas fiscais): cliente, valor,
   data de competencia (nao pode ser futura — E0015), descricao e
   informacoes complementares; opcionalmente "mandar ao cliente por e-mail /
   WhatsApp depois de emitida". A nota fica **Aguardando assinatura**. Nada
   vai para a Receita e nenhum numero de DPS e gasto. O tomador ja e
   conferido aqui (cliente empresa sem endereco completo e recusado — E0235).
   O titular do certificado recebe aviso por e-mail e WhatsApp.
2. **Assinar** (so o titular do certificado): marca uma ou varias notas,
   digita a **senha do e-CNPJ** — ela **nao fica guardada** — e o sistema
   reserva o numero da DPS, monta, assina e transmite, nota por nota.
3. Resultado de cada nota:
   - **Emitida**: numero da NFS-e, XML autorizado, PDF (DANFSe) gerado pelo
     sistema. Em producao o PDF entra nos documentos do cliente (e na pasta
     dele na nuvem) e, se foi pedido, vai ao cliente por e-mail/WhatsApp.
   - **Recusada**: fica com os erros da Sefin (codigo e descricao). Corrige-se
     o cadastro e assina-se de novo — com numero novo.
   - **Confirmacao pendente**: a conexao caiu depois do envio. "Verificar
     situacao" pergunta a Sefin pela DPS: se a nota foi gerada, vira emitida;
     se nao, volta para assinar.
4. **Cancelar** (titular, com a senha): motivo (erro na emissao, servico nao
   prestado, outros) e justificativa de pelo menos 15 caracteres.
5. **Descartar**: so nota que nao foi emitida.

Atalhos para preparar: no **recibo** da ficha do cliente ("Preparar a nota
fiscal deste recibo") e na **parcela recebida** dos honorarios ("preparar
nota"). Nunca automatico: so quando o cliente pede.

## O que o sistema trata sozinho

- **E0120** — a inscricao municipal existe na prefeitura mas nao no cadastro
  nacional: reenvia na hora sem ela, com numero novo.
- **E0008** — a DPS sai com horario um minuto antes, para nao ficar a frente
  do relogio da Sefin.
- **E0718** — certificado tem de ser o e-CNPJ do proprio emitente: e-CPF ou
  CNPJ diferente do cadastro sao recusados ja no envio do certificado.
- **Regime pela competencia** — mudanca de regime marcada (ex.: entra no
  Simples em 1/1) vira sozinha; nota de dezembro emitida em janeiro sai pelo
  regime de dezembro.
- **IBS/CBS** — o grupo entra a partir da competencia configurada (obrigatorio
  para optante do Simples desde 1/1/2027; antes de 1/1/2026 a Receita recusa —
  E0850). Com IBS/CBS a nota exige o endereco do cliente.

## Cadastro do emissor

Em **Notas fiscais > Configurar emissor** (administrador): razao social, CNPJ,
inscricao municipal (se a prefeitura exigir), codigo IBGE, telefone e e-mail
da nota e o **regime em linguagem de escritorio**:

| Na tela | No leiaute |
| --- | --- |
| Optante do Simples, ISS dentro do DAS | opSimpNac 3, regApTribSN 1, regEspTrib 0, pTotTribSN |
| Optante do Simples, ISS fixo (sociedade de profissionais) | opSimpNac 3, regApTribSN 2, regEspTrib 6 |
| Nao optante, ISS normal | opSimpNac 1, regEspTrib 0, pTotTrib federal/estadual/municipal |
| Nao optante, ISS fixo | opSimpNac 1, regEspTrib 6 |

A nota **nao manda aliquota** (E0604/E0625): quem calcula o ISS e a Sefin com
o cadastro do municipio. O percentual aproximado de tributos (Lei 12.741) vem
do contador. Padroes: codigo de tributacao 171401 (advocacia), NBS 113012000.
Comece em **Testes** (producao restrita, sem valor fiscal); passar para
producao pede confirmacao.

## Certificado

Enviado em **Configuracoes** (administracao destravada): arquivo .pfx/.p12 e
senha. A senha so confere o arquivo e e descartada; o arquivo fica cifrado
(Integracoes, NFSE_CERT). **Quem envia vira o titular**: so essa pessoa
assina, cancela e verifica notas. Certificado enviado antes deste fluxo (sem
titular) pode ser usado por qualquer administrador — reenviar define o titular.

A conexao com a Sefin e por **TLS mutuo** com o proprio certificado; o .pfx e
reempacotado em AES so em memoria (o OpenSSL 3 recusa as cifras antigas que
as certificadoras usam).

## Conferir contra a homologacao

```
NFSE_SENHA='...' npm run conferir-nfse -- <slug> [--emitir]
```

Sem `--emitir`: abre o certificado e consulta o convenio do municipio (prova
certificado, conexao e municipio). Com `--emitir`: manda uma DPS de R$ 1,00 a
homologacao e mostra o retorno.

## Testes

`testes/nfse.test.ts`: leiaute (Simples, nao optante, ISS fixo, IBS/CBS),
assinatura real com certificado gerado na hora, e o fluxo inteiro contra uma
Sefin servida localmente (`NFSE_BASE_URL`): preparar, so o titular, E0120,
recusa e nova assinatura, queda de conexao e verificacao, cancelamento,
descarte e isolamento entre escritorios.

## Cadastro fiscal lendo os documentos

Com o modulo IA, o cadastro fiscal (Notas fiscais, so administrador) abre o
leitor de documentos (perfil `FISCAL`): cartao CNPJ, contrato social ou
alteracao, ficha de inscricao municipal e termo de opcao pelo Simples, juntos.

- A IA le razao social, CNPJ (digito conferido), inscricao municipal, CEP da
  sede, cidade, UF, CNAE principal e o regime — este so quando um documento
  diz (o cartao CNPJ sozinho nao diz).
- O **codigo IBGE** sai do CEP (servico de CEP), e o **codigo do servico** do
  CNAE: 6911-7/01 sugere `171401` (subitem 17.14, advocacia). Outro CNAE fica
  sem sugestao. Codigo que a IA tente devolver e descartado
  (`completarCadastroFiscal`).
- A aliquota do ISS nao esta nesses documentos: fica com o contador.

Nada e gravado pela leitura: o formulario chega preenchido, marcado como
sugestao da IA, e so vale depois de "Guardar cadastro".
