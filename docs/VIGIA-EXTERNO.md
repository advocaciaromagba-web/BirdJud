# Vigia externo

O vigia interno (`scripts/vigia.mjs`, serviço `cron-vigia`) roda dentro do
Railway. Se o Railway inteiro cair, ele cai junto. Ele também não enxerga o
DNS do domínio próprio. O vigia externo cobre essas duas lacunas sem conta
nova em serviço de monitoramento.

## Como funciona

- O GitHub Actions roda `.github/workflows/vigia-externo.yml` **a cada 10
  minutos**, de fora do Railway.
- O workflow executa `scripts/vigia-externo.sh`, que confere:
  - `https://birdjud.com.br/api/saude`: a aplicação e o banco;
  - `https://birdjud.com.br/api/saude/rotinas`: o trabalhador está concluindo
    trabalho (algum nos últimos 90 minutos) e nenhuma rotina essencial de
    escritório — avisos, lembretes, captura e triagem de publicações — tem a
    última execução em falha. Responde só números, nunca qual escritório: o
    detalhe está no log do serviço TRABALHADOR. Existe desde 13/10/2026, quando
    os lembretes de um escritório ficaram horas parados com o site "verde";
  - `https://birdjud.com.br/entrar`: a tela de entrada;
  - `https://www.birdjud.com.br`: o site;
  - o certificado de `birdjud.com.br`, com pelo menos 14 dias de validade.
- Cada conferência tenta 3 vezes, com 20 s entre elas. Um soluço de rede não
  vira alarme.

## O alarme

Quando algo falha, o workflow abre a issue **"Vigia externo: sistema com
falha"**, com o relatório e uma menção ao dono do repositório. O GitHub manda
e-mail ao dono. Enquanto a falha continua, não abre outra. Quando o sistema
volta, comenta "Voltou" e fecha a issue.

## O alarme de espaço (18/10/2026)

Na mesma rodada, `scripts/vigia-espaco.sh` consulta
`https://birdjud.com.br/api/saude/espaco`. Ela responde 503 quando o disco
dos arquivos (volume do APP, `/dados`) ou o banco passa de **70%**, e diz só
qual dos dois e o percentual; abaixo disso, só `{"ok":true}`.

- O alarme é outra issue: **"Vigia externo: espaço acima de 70%"**. Disco
  enchendo não é sistema fora do ar, e a providência é outra: **aumentar o
  volume no Railway** (serviço → Volume → tamanho) antes de 90%.
- Fecha sozinha quando voltar a ficar abaixo de 70%.
- Se a medida não responder, não há alarme de espaço: queda é com a
  conferência principal.
- Como mede: `statfs` da pasta dos arquivos quando ele enxerga o próprio
  volume; senão, a soma dos arquivos registrados. Banco:
  `pg_database_size`. Os dois contra 5000 MB, ou contra
  `LIMITE_DO_VOLUME_DE_ARQUIVOS_MB` e `LIMITE_DO_VOLUME_DO_BANCO_MB` no
  serviço APP, se o volume for aumentado.

Para receber o e-mail, deixe ligadas as notificações de issues do
repositório em github.com → Settings → Notifications. Para dono do
repositório, elas vêm ligadas por padrão.

## Cuidados

- O repositório é **público**: a issue de falha fica visível para qualquer
  pessoa. O relatório diz só qual endereço não respondeu, sem detalhe interno.
- O GitHub **desliga workflows agendados** de repositório público depois de
  60 dias sem nenhum commit. Se isso acontecer, ele avisa por e-mail; basta
  religar em Actions → Vigia externo → Enable workflow.
- O horário do agendamento do GitHub pode atrasar alguns minutos em horário
  de pico.
- Para conferir à mão: `bash scripts/vigia-externo.sh`.
