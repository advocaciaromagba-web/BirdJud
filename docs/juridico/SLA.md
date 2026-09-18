# SLA — Nivel de servico do BirdJud

> Minuta para revisao juridica.

## 1. Disponibilidade

Meta de **99,5% ao mes**, medida sobre a resposta da aplicacao no endereco do
Escritorio, fora das janelas programadas.

Nao contam como indisponibilidade:
- janela programada avisada com 48h;
- falha de servico de terceiro conectado pelo Escritorio;
- falha da conexao do Escritorio;
- suspensao por inadimplencia.

## 2. Janela programada

Manutencao preferencialmente entre 23h e 5h, dias uteis, com aviso no sistema.
Migracao de banco que exija parada: aviso com 5 dias.

## 3. Suporte

| Gravidade | O que e | Primeira resposta | Objetivo de solucao |
| --- | --- | --- | --- |
| Critica | sistema fora, ou dado de um escritorio visivel a outro | 1 hora util | 4 horas uteis |
| Alta | modulo contratado parado (publicacoes, WhatsApp, NFS-e) | 4 horas uteis | 1 dia util |
| Media | funcao com defeito e contorno possivel | 1 dia util | 5 dias uteis |
| Baixa | duvida, melhoria, ajuste visual | 2 dias uteis | sem prazo |

Horario util: dias uteis, 9h as 18h (horario de Brasilia).

**Vazamento entre escritorios e sempre critico**, mesmo que atinja um unico
registro, e gera comunicacao imediata aos escritorios envolvidos.

## 4. Canal

[E-MAIL DE SUPORTE] — e o canal oficial; o que chega por ele vira chamado com
numero. Pedido feito por outro meio pode nao ser registrado.

## 5. Consequencia do descumprimento

Descumprida a meta de disponibilidade no mes, o Escritorio tem direito a
abatimento na fatura seguinte:

| Disponibilidade no mes | Abatimento |
| --- | --- |
| de 99,0% a 99,5% | 5% |
| de 95,0% a 99,0% | 10% |
| abaixo de 95,0% | 20% |

O abatimento e pedido por e-mail em ate 30 dias do fim do mes.

## 6. Backup e restauracao

- backup diario, retido por 30 dias;
- restauracao de um escritorio a partir do backup: objetivo de 8 horas uteis;
- o procedimento e testado periodicamente, e o teste fica registrado em
  `docs/SEGURANCA.md`.
