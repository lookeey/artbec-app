# Orientações do projeto

- Responda em português, de forma curta, direta e informal.

## Hospedagem e diagnóstico

- O app é hospedado pelo Dokploy, usando Docker. A migração para fora do Sites já foi feita.
- Use o repositório Git e o fluxo Docker/Dokploy como fonte de verdade para código, deploy, variáveis e logs de produção.
- Arquivos e nomes herdados do Sites, incluindo `.openai/hosting.json`, scripts e plugins de build, são legado técnico; sua presença não indica hospedagem ativa no Sites. Não use o conector Sites para consultar ou publicar este app.
- Para subir o app, configurar domínio/proxy, preservar o volume e investigar produção, consulte `docs/docker.md`. Para os dados importados na migração, consulte `docs/initial-migration.md`.
- Ao investigar falhas em produção, obtenha os logs do container no Dokploy e reproduza o fluxo no runtime Docker/Wrangler local quando possível. Preserve o volume existente e mantenha credenciais fora das saídas.
