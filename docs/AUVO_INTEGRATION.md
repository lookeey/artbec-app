# Integração Auvo — Desempenho

O módulo **Desempenho** lê usuários, clientes e tarefas da API Auvo v2 e mantém uma cópia operacional no D1. As credenciais são enviadas apenas às rotas do servidor, criptografadas com AES-GCM antes de serem gravadas e nunca retornam pela API do site.

## Configuração

1. Defina `AUVO_ENCRYPTION_KEY`, `AUVO_WEBHOOK_SECRET` e `ARTBEC_ADMIN_EMAILS` no ambiente do Site.
2. Abra **Desempenho → Integração** como administrador.
3. Informe a API Key e o API Token, teste a conexão e salve.
4. Relacione cada técnico Artbec ao usuário Auvo correspondente. Um usuário Auvo só pode ser ligado a um técnico.
5. Execute a primeira sincronização.

## Métricas

O painel calcula tarefas programadas, finalizadas, em andamento, pausadas, pendentes, clientes atendidos e taxa de conclusão. A taxa é `tarefas com status Finalizada (5) / tarefas programadas no período`.

Duração de atendimento, horários de check-in/check-out e conclusão de questionários não são exibidos porque o contrato de leitura publicado pela Auvo não fornece esses campos de forma confiável.

## Webhook

O endpoint preparado é `POST /api/auvo/webhook`. A chamada precisa enviar o segredo no cabeçalho `x-artbec-webhook-secret`. Os eventos são registrados de forma idempotente em `auvo_webhook_events`; a sincronização completa continua sendo a fonte de consolidação.

## Banco e auditoria

A migration `drizzle/0005_auvo_performance.sql` cria as tabelas da integração, cache, vínculos, logs de sincronização, eventos e auditoria. Repetir uma sincronização atualiza os mesmos registros pelos IDs imutáveis da Auvo.
