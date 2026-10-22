# Exportação completa Artbec - formato artbec-portable-v1

Este pacote é uma cópia administrativa: contém dados financeiros, acessos, tarefas privadas de TODOS os usuários e arquivos pessoais. Somente a administradora pode gerar o ZIP. Guarde-o como um backup privado.

## Conteúdo
- database/database.json: cópia consistente das tabelas D1, schemas, índices, triggers e base importada. Inclui registros excluídos, auditoria, usuários, tarefas Auvo e configurações persistidas.
- database/database.sql: SQLite/D1, com conteúdo antes dos triggers para não repetir auditoria. Inclui artbec_imported_base e artbec_consolidated_records com os dados importados e a visão consolidada. Importar numa base NOVA.
- database/tables/*.csv: cada tabela em UTF-8, com cabeçalho e campos entre aspas. O JSON/SQL preserva melhor tipos, NULL e BLOB.
- data/consolidated.json e data/consolidated.csv: base importada mesclada às alterações persistidas; registros excluídos não reaparecem nessa visão. O banco bruto mantém exclusões e histórico.
- base/*.json: fontes importadas completas, incluindo tabelas auxiliares e dados históricos que fazem parte do aplicativo.
- storage/objects/*: TODOS os objetos guardados no R2, inclusive fotos antigas preservadas, anexos e backups salvos. O nome no ZIP é um identificador seguro; o manifesto guarda a chave ORIGINAL, tipo, metadados e checksum.
- assets/public/*: arquivos fornecidos junto do site, incluindo logo, mascotes e documentos legados.
- preferences/browser.json: tema e favoritos do navegador que solicitou a exportação, quando enviados pelo botão. Não é possível ler preferências de outros dispositivos.
- manifest.json: versão do formato, contagens, datas e SHA-256 de cada arquivo (exceto o próprio manifesto), além do mapa de chaves.

## Importar e verificar em uma cópia separada
Com Python 3 instalado, execute:
  python tools/importar.py backup-artbec.zip --dest artbec-restaurado
A ferramenta usa apenas a biblioteca padrão. Confere hashes/tamanhos/CRC, extrai arquivos e cria artbec.sqlite em uma pasta NOVA. Não conecta ao site nem substitui o banco atual. Mantenha database.json, data/consolidated.json e base/*.json juntos da base SQLite: parte do app usa fontes importadas e sobreposições de alterações.
Para outro sistema, use o SQL SQLite, os CSVs ou os JSONs conforme o importador de destino; adapte os relacionamentos indicados no schema. Uma aplicação diferente precisa mapear esses campos, não existe importação universal automática.

## Restaurar imagens e documentos
Reenvie storage/objects/* ao armazenamento de destino usando originalKey do manifesto. Chaves preservadas mantêm vínculos com documentos, photoKey, imageKey, documentKey e anexos dentro dos campos JSON. Se as URLs mudarem, crie um redirecionamento ou adapte os endpoints /api/documents, /api/staff-photos, /api/stock-images, /api/quote-images, /api/complaint-photos, /api/fleet-documents e /api/procurement/files. assets/public deve voltar ao caminho público original.

## Escopo e integridade
O banco é lido em um batch consistente. R2 e arquivos estáticos são lidos em seguida: não existe uma transação única entre banco e arquivos. Cada objeto é lido com a versão/ETag listada; arquivo ausente, modificado ou incompleto interrompe a exportação, sem marcar o manifesto como completo. Para uma cópia coordenada, evite alterações durante o download.
O ZIP64 usa STORE para transferir arquivos em fluxo, sem montar o ZIP inteiro na memória do servidor. O tamanho pode ser maior que um ZIP comprimido, especialmente porque inclui backups antigos.
Senhas não estão em texto puro: app_users usa PBKDF2-HMAC-SHA256, 100000 iterações, salt/hash Base64. Invalide sessões de app_sessions ao migrar. Credenciais Auvo persistidas permanecem criptografadas; chaves e segredos de ambiente, configurações de hospedagem, código-fonte, cache de navegador e arquivos de dispositivos que nunca foram enviados não são dados desta exportação. Reconfigure integrações/segredos no sistema novo. Referências externas só incluem os dados já sincronizados no aplicativo, não todo o conteúdo da conta externa.
