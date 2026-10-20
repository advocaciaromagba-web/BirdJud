# SLA — Nível de serviço do BirdJud

> Versão 2026-10-20.

## 1. Disponibilidade

Meta de **99,5% ao mês**, medida sobre a resposta da aplicação no endereço do
Escritório, fora das janelas programadas.

Não contam como indisponibilidade:
- janela programada avisada com 48h;
- falha de serviço de terceiro conectado pelo Escritório;
- falha da conexão do Escritório;
- suspensão por inadimplência.

## 2. Janela programada

Manutenção preferencialmente entre 23h e 5h, dias úteis, com aviso no sistema.
Migração de banco que exija parada: aviso com 5 dias.

## 3. Suporte

| Gravidade | O que é | Primeira resposta | Objetivo de solução |
| --- | --- | --- | --- |
| Crítica | sistema fora, ou dado de um escritório visível a outro | 1 hora útil | 4 horas úteis |
| Alta | módulo contratado parado (publicações, WhatsApp, NFS-e) | 4 horas úteis | 1 dia útil |
| Média | função com defeito e contorno possível | 1 dia útil | 5 dias úteis |
| Baixa | dúvida, melhoria, ajuste visual | 2 dias úteis | sem prazo |

Horário útil: dias úteis, 9h às 18h (horário de Brasília).

**Vazamento entre escritórios é sempre crítico**, mesmo que atinja um único
registro, e gera comunicação imediata aos escritórios envolvidos.

## 4. Canal

contato@blackbirdsolucoes.com.br — é o canal oficial; o que chega por ele vira chamado com
número. Pedido feito por outro meio pode não ser registrado.

## 5. Consequência do descumprimento

Descumprida a meta de disponibilidade no mês, o Escritório tem direito a
abatimento na fatura seguinte:

| Disponibilidade no mês | Abatimento |
| --- | --- |
| de 99,0% a 99,5% | 5% |
| de 95,0% a 99,0% | 10% |
| abaixo de 95,0% | 20% |

O abatimento é pedido por e-mail em até 30 dias do fim do mês.

## 6. Backup e restauração

- backup diário, retido por 30 dias;
- restauração de um escritório a partir do backup: objetivo de 8 horas úteis;
- o procedimento é testado periodicamente, e o teste fica registrado em
  `docs/SEGURANCA.md`.
