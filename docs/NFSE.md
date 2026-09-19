# NFS-e (nota fiscal de servico)

O escritorio emite a nota com o **certificado e-CNPJ dele**, pelo cadastro
fiscal dele. A plataforma nao tem certificado proprio: assinar nota de terceiro
com certificado da plataforma seria falsidade, nao conveniencia.

## Leia isto antes de emitir a primeira nota

**O layout do XML e o endereco do ambiente nacional foram escritos a partir da
documentacao e ainda NAO foram conferidos contra a homologacao.** Enquanto
`npm run conferir-nfse` nao rodar limpo, trate `src/lib/nfse/layout.ts` e
`src/lib/nfse/nacional.ts` como suposicoes — do mesmo jeito que o mapeamento do
DJEN foi tratado ate alguem rodar do Brasil.

O que **esta** provado, com teste que roda a cada push: a assinatura digital
(assina e confere de verdade, e documento adulterado depois de assinado deixa de
conferir), a numeracao sem buraco nem repeticao, o que acontece quando a
prefeitura recusa, e o isolamento entre escritorios.

O sistema nasce em **homologacao**, e a tela avisa disso. Nota de homologacao
nao tem valor fiscal e nao gera ISS.

## Um aviso sobre padroes municipais

NFS-e nao e um padrao so. Existe o **padrao nacional** (o que este modulo fala)
e dezenas de padroes municipais — ABRASF em varias versoes, e prefeituras com
sistema proprio. Municipios vem migrando para o nacional, mas nao todos, e nao
ao mesmo tempo.

Se a prefeitura do escritorio ainda nao estiver no padrao nacional, o caminho e
acrescentar um emissor: `layout.ts` e `nacional.ts` sao os dois unicos arquivos
que conhecem o formato. Banco, tela, fila e numeracao continuam valendo.

## Cadastro fiscal

**Notas > Cadastro fiscal**, so admin. Estes dados saem impressos na nota:

| Campo | De onde vem |
|---|---|
| Razao social, CNPJ | contrato social |
| Inscricao municipal | cadastro na prefeitura |
| Codigo IBGE do municipio | 7 digitos, do IBGE |
| Regime | Simples Nacional, MEI ou normal |
| Codigo do servico | **do contador** — advocacia costuma cair no item 17.14 da LC 116, mas quem confirma e ele |
| Aliquota do ISS | **do contador** — varia por municipio e por regime |
| Serie e ambiente | serie 1 serve para a maioria; comece em homologacao |

Codigo de servico e aliquota nao tem padrao que sirva para todo mundo, e errar
ali nao aparece na hora: aparece no fim do mes, na apuracao.

## Certificado

**Integracoes > Certificado e-CNPJ (NFS-e)**: o `.pfx` em base64 e a senha. O
teste de conexao abre o arquivo de verdade, mostra o titular e avisa quando
falta menos de 30 dias para vencer.

Converter o `.pfx` para base64:

```bash
base64 -w0 certificado.pfx        # Linux
base64 -i certificado.pfx         # macOS
```

O arquivo fica cifrado no banco, como toda credencial de escritorio.

## Conferir contra a homologacao

```bash
npm run conferir-nfse -- <slug-do-escritorio>
```

Ele monta um DPS com o cadastro e o certificado do escritorio, assina, manda
para a homologacao e imprime o que foi e o que voltou. **Cada campo reclamado na
resposta e um ponto a corrigir em `layout.ts`.** E assim que a incerteza deste
modulo se fecha.

## Como a emissao se comporta

- **O numero e reservado antes do envio.** Se a prefeitura recusar, a nota fica
  RECUSADA com aquele numero e o motivo, e a proxima usa o numero seguinte.
  Numero gasto e o que o contador espera ver; numero repetido, nao.
- **A recusa chega inteira ate a tela**, com o codigo da prefeitura — e ele que
  o contador procura no manual.
- **Cancelar so depois que a prefeitura aceita.** Marcar antes deixaria o
  escritorio achando que cancelou uma nota que continua valendo, e pagando ISS
  sobre servico que nao houve. Prazo e regra de cancelamento sao municipais:
  quem diz "nao" e o ambiente nacional, nao nos.
- Cliente sem CPF/CNPJ nao vira nota, e a mensagem diz de quem e o cadastro que
  falta.

## Para testar sem a prefeitura

`NFSE_BASE_URL` aponta o ambiente para outro endereco. E assim que a bateria
roda e como se confere o formato do que sai sem emitir nota de verdade.
