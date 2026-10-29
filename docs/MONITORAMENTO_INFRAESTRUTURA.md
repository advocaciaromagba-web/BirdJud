# Monitoramento de infraestrutura — BirdJud (piloto)

## Objetivo e segurança
Esta alteração adiciona **somente** um endpoint protegido de telemetria do processo Node.js em `GET /api/admin/infra/metricas`. Não muda banco, schema Prisma, deploy, serviços Railway nem rotinas de backup. O endpoint permanece fechado se a variável `INFRA_MONITOR_TOKEN` não estiver configurada com no mínimo 32 caracteres.

## Configuração em ambiente de homologação
1. Criar um segredo aleatório forte de pelo menos 32 caracteres (por exemplo `openssl rand -hex 32`).
2. Definir `INFRA_MONITOR_TOKEN` **apenas** nas variáveis privadas do serviço de aplicação (não usar `NEXT_PUBLIC_`, não salvar no Git e não colocar em URL).
3. Consultar via `Authorization: Bearer <segredo>`, HTTPS e sem guardar o token nos logs.
4. Confirmar 401 sem token, 401 com token incorreto e 200 com o correto. Não expor diretamente a usuários finais.
5. Se houver múltiplas instâncias, coletar de cada uma: métricas de processo não representam todo o cluster.

## Exemplo de chamada
```bash
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $INFRA_MONITOR_TOKEN" \
  "https://SEU-DOMINIO/api/admin/infra/metricas"
```

## O que é medido
- Memória RSS/heap/external do processo Node.js.
- Uptime do processo e latência p99 do event loop.
- Identificador de réplica, quando informado pelo Railway.

**Não** é medido aqui: CPU da máquina, RAM total da VPS, uso real do disco, usuários simultâneos, latência HTTP p95, taxa de erros, conexões do PostgreSQL, backups ou volume dos trabalhos agendados. Para esses dados integrar Railway Metrics/API e observabilidade do PostgreSQL, com permissões mínimas e acesso exclusivamente administrativo.

## Regras iniciais de alerta (ajustar a partir da linha de base)
- Atenção: CPU do contêiner > 75% por 15 min, memória do contêiner > 80% de forma sustentada ou p95 de API acima do SLO.
- Crítico: CPU > 90% sustentada, esgotamento de conexões do banco, erros 5xx acima do SLO ou indisponibilidade.
- Não fazer migração automática com base em um único limiar; investigar gargalo, histórico, capacidade, custos e plano de reversão.
- Alertas com deduplicação, períodos de silêncio e canais de notificação controlados; sem documentos de clientes ou informações sensíveis.

## Próximas etapas antes da publicação
1. Revisar PR, executar `npm run typecheck`, `npm run teste` e testes de autorização.
2. Implantar em homologação primeiro, sem abrir acesso público ao painel.
3. Criar serviço coletor central que armazene séries históricas, estados de alerta e auditoria.
4. Integrar métricas Railway (CPU/memória/disco), PostgreSQL, endpoints sintéticos e estados dos backups.
5. Adicionar painel restrito ao administrador global e notificação por e-mail/WhatsApp.
6. Testar disparos, restauração e reversão antes de ativar em produção.

## Atenção identificada na inspeção (28/10/2026)
O último deployment do serviço `backup` do projeto Railway `detetiveproc` está marcado como `CRASHED`. Isso não comprova falha de todas as cópias, mas requer análise dos logs e teste de restauração. Priorizar auditoria desse serviço antes de considerar os backups confiáveis.
