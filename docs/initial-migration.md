# Migração inicial do export de 22/10/2026

O payload versionado em `migration/initial/` veio de
`artbec-completo-2026-10-22.zip` (formato `artbec-portable-v1`). Não é preciso
enviar o ZIP ao Dokploy: o Dockerfile inclui os arquivos na imagem. O manifesto
original e todos os seus arquivos são preservados, com SHA-256 fixado no código.
O pacote contém dados administrativos, tarefas privadas, hashes de senha e
documentos pessoais; tem o mesmo controle de acesso do repositório e da imagem.

## Build e inicialização

1. No build, `docker/prepare-migration.mjs` verifica tamanho e SHA-256 de cada
   arquivo, copia `base/*.json` para as quatro fontes compiladas de `data/` e
   incorpora `assets/public/` ao `public/` do app. Um pacote inválido falha o build.
2. Ao iniciar o container, o entrypoint configura o Wrangler e aplica as
   migrations de schema normais ao D1 local.
3. Antes de abrir a porta HTTP, `docker/import-initial-data.mjs` consulta
   `_artbec_initial_import` no mesmo banco usado pelo app. Se o ID
   `artbec-initial-2026-10-22` já estiver concluído, retorna sem importar.
4. Na primeira execução, verifica novamente o pacote e restaura os 89 objetos
   R2 com as chaves e os metadados originais, conferindo seus bytes após gravar.
5. Em uma única transação D1, substitui as tabelas da aplicação pelas 22 tabelas
   exportadas e restaura índices e triggers após os dados, sem repetir auditoria.
   As quatro sessões antigas são descartadas; os quatro usuários e hashes de
   senha são mantidos. São restaurados 2.073 registros do banco. As 4.037 linhas
   da base importada continuam nas fontes compiladas, com exclusões e mudanças
   aplicadas pela lógica normal do app. A tabela `d1_migrations` do Wrangler e
   os metadados internos do emulador são preservados.
6. A mesma transação grava o marcador de conclusão. Só então o servidor inicia.

A primeira importação substitui os dados atuais da aplicação neste volume,
conforme solicitado. Não é uma mesclagem. Objetos R2 com chaves coincidentes são
substituídos; objetos antigos sem correspondência não são apagados.

Uma falha de upload não altera as tabelas da aplicação nem grava o marcador.
Uma falha no banco reverte a transação inteira, inclusive o marcador. O container
falha sem abrir o servidor e a próxima execução tenta novamente. Depois do
sucesso, reinícios e novos deploys preservam alterações, exclusões, novos usuários
e arquivos. Não remova o marcador para tentar reparar um arquivo isolado.

## Dokploy

Continue persistindo **`/app/.wrangler/state`**. Tanto os dados quanto o marcador
ficam neste volume; sem ele, um container novo importa novamente a base inicial.
Use uma única instância durante a migração, sem outro container escrevendo no
mesmo volume. Aguarde o log `Migração inicial concluída` antes de acessar o app;
o healthcheck do compose aguarda até cinco minutos na primeira inicialização.

Mantenha `ARTBEC_PUBLIC_ORIGIN` com o domínio HTTPS público. Para reutilizar as
credenciais Auvo importadas, configure a mesma `AUVO_ENCRYPTION_KEY` usada na
versão antiga, além de `AUVO_WEBHOOK_SECRET` se usado. O ZIP não contém segredos
de ambiente. Usuários entram novamente com as senhas existentes. Preferências
do navegador ficam arquivadas no pacote, pois são específicas do dispositivo.

O payload deve permanecer disponível nas builds enquanto esta migração fizer
parte do Dockerfile. Removê-lo da imagem em uma atualização futura não requer
apagar o marcador ou o volume; ajuste primeiro as etapas de build e importação.

## Validação

`node --test docker/import-initial-data.test.mjs` usa o pacote real em D1/R2
Miniflare descartáveis. Cobre falha no upload, rollback no final da transação,
comparação de todas as linhas restauradas, checksums e metadados dos 89 objetos,
preservação do histórico Wrangler, validação de relacionamentos e reinício com
alteração de registro, alteração de arquivo e exclusão de arquivo. Confere que
o importador e os bindings usados pelo Wrangler leem o mesmo estado persistido.
