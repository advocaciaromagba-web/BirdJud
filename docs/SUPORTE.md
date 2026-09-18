# Suporte e piloto

## Canal

E-mail unico: **[E-MAIL DE SUPORTE]**. O que chega por ele vira chamado; pedido
por outro meio pode se perder. Prazos por gravidade: `docs/juridico/SLA.md`.

## Antes de abrir chamado

Metade dos chamados de integracao se resolve na propria tela: **Integracoes >
Testar conexao** diz o que o provedor respondeu. Se disser "token recusado", o
problema esta na conta do escritorio, nao no BirdJud.

## O que a equipe pode ver

Abrir a ficha de um escritorio no painel ja grava registro de acesso, com
operador, motivo e momento. O escritorio pode pedir esse registro a qualquer
tempo. Nao existe "entrar como o escritorio".

## Roteiro do piloto

Antes de abrir para venda, 2 ou 3 escritorios por 30 dias.

**Antes de comecar**
- [ ] contratos e acordo de LGPD revisados por advogado e assinados
- [ ] precos reais definidos (a tabela de `src/lib/precos.ts` e provisoria)
- [ ] backup automatico agendado na infraestrutura
- [ ] **restauracao testada de verdade**, com o resultado anotado em
      `docs/SEGURANCA.md`
- [ ] revisao de seguranca feita e achados tratados
- [ ] canal de suporte no ar, com alguem responsavel por responder

**Durante**
- [ ] conferir a bateria de isolamento verde a cada deploy
- [ ] acompanhar a fila: trabalho em FALHOU e sintoma, nao ruido
- [ ] anotar todo chamado, mesmo o resolvido em minutos — e o que mostra onde
      o cadastro guiado esta falhando
- [ ] conferir se a regua de cobranca gerou fatura e venceu prazo corretamente

**Para encerrar o piloto**
- [ ] 30 dias com os contratos assinados
- [ ] uma restauracao de backup testada de verdade no periodo
- [ ] nenhum incidente de isolamento em aberto
- [ ] volume de chamados dentro do que a equipe atual aguenta
