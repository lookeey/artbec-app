# Docker local

```sh
docker compose up -d --build
docker compose logs -f app
```

Abra http://localhost:3000. O container serve HTTP; em hospedagem, o proxy
termina o HTTPS. Use os usuários e senhas já configurados
no app; as migrations incluem os cadastros existentes, sem uma nova senha padrão.

O container executa o build pelo Wrangler/Miniflare, com D1 (SQLite) e R2 locais.
Não precisa de conta ou token Cloudflare. A integração Auvo continua exigindo
conexão com a API Auvo. Esse modo usa o runtime de desenvolvimento local da
Cloudflare para executar o artefato compilado.

## Volume

Só precisa persistir **`/app/.wrangler/state`**. O compose cria o volume nomeado
`artbec-data` (normalmente `<pasta-do-projeto>_artbec-data`). Ele contém banco D1,
arquivos R2, backups internos e outros estados persistidos pelo emulador.
Preserve a pasta inteira, incluindo os metadados do R2.

Para usar uma pasta do host, substitua a montagem no compose por:

```yaml
volumes:
  - ./docker-data:/app/.wrangler/state
```

Antes de subir com bind mount no Linux:

```sh
mkdir -p docker-data
sudo chown -R 1000:1000 docker-data
```

Não é necessário montar código, `node_modules` ou `data/`: estão na imagem.
A primeira execução cria o banco e aplica as migrations; os reinícios aplicam
somente as pendentes. Um volume novo começa com os dados versionados do projeto.
Esta build inclui a [migração inicial dos dados exportados](initial-migration.md),
executada automaticamente antes de abrir o servidor.
Não compartilhe esse volume com várias instâncias simultâneas.

Após a importação inicial, `docker/regularize-historical-sales.mjs` aplica uma
correção histórica solicitada em 23/10/2026: somente vendas do canal **Clientes**
com competência válida até **08/2026**, inclusive, ficam pagas e entregues.
Vita, Academia, competências posteriores, registros excluídos e estoque ficam
preservados. A base é mesclada com as alterações atuais antes de selecionar as
vendas. Valores, produtos, datas e alocações existentes não são alterados; não
se inventa uma data de pagamento ou entrega nem se cria uma saída de estoque.
As gravações, a auditoria e o marcador em `_artbec_data_repairs` são atômicos.
O marcador guarda as vendas anteriores completas e impede repetir a correção
nos próximos reinícios, inclusive após edições manuais. O servidor só inicia
depois do sucesso. Teste com:

```sh
node --test docker/regularize-historical-sales.test.mjs
```

## Configuração

O compose aceita variáveis pelo shell ou por um `.env` local:

```dotenv
ARTBEC_PORT=3000
ARTBEC_BIND_IP=127.0.0.1
# Em hospedagem, use o domínio HTTPS configurado no proxy:
ARTBEC_PUBLIC_ORIGIN=
# Opcionais, apenas para a integração Auvo:
AUVO_ENCRYPTION_KEY=
AUVO_WEBHOOK_SECRET=
```

Para salvar credenciais Auvo, defina uma chave de criptografia com pelo menos
32 caracteres e guarde a mesma chave junto dos backups. Por exemplo, gere uma com
`openssl rand -hex 32`. Se importar credenciais criptografadas, use a chave original.

## Dokploy

No domínio do Dokploy, configure o destino com protocolo **HTTP** e porta
interna **3000**. Ative HTTPS no domínio público e defina a variável:

```dotenv
ARTBEC_PUBLIC_ORIGIN=https://app.seudominio.com
```

O fluxo fica `navegador HTTPS → proxy Dokploy → HTTP app:3000`. Essa variável
informa ao Worker a origem pública usada nas verificações de Origin das APIs,
evitando que o HTTPS externo seja comparado com o HTTP interno. O cookie da
sessão mantém `Secure`, pois o navegador acessa o domínio por HTTPS.
Não é necessário certificado no container nem desativar a validação TLS no proxy.

As chamadas de saída para a API Auvo usam HTTPS no workerd. A imagem instala
`ca-certificates` para validar os certificados dos servidores externos. Sem esse
pacote, a base `node:24-bookworm-slim` causa `unable to get local issuer certificate`
e a integração retorna HTTP 502 com uma referência de erro interno.
Após atualizar o Dockerfile, faça um novo build e deploy no Dokploy.
Não é necessário alterar as variáveis Auvo ou a configuração do proxy para esse erro.

Para verificar o TLS da Auvo na imagem construída, sem usar credenciais reais:

```sh
docker compose run --rm --no-deps --entrypoint node app --test docker/auvo-tls.test.mjs
```

Esse teste precisa de acesso à internet e verifica a conexão HTTPS com a API;
a autenticação com credenciais reais deve ser conferida pela tela de integração.

Para abrir só a tela via rede local, defina `ARTBEC_BIND_IP=0.0.0.0` e acesse
`http://IP-DO-SERVIDOR:3000`. Para usar login fora de localhost, use o domínio
HTTPS do proxy, pois navegadores não enviam o cookie Secure por HTTP comum.

## Backup e atualização

Pare o app antes de copiar o volume completo, para manter SQLite e arquivos
consistentes. Exemplo com bind mount:

```sh
docker compose stop app
tar -czf artbec-backup.tgz docker-data
docker compose start app
```

Guarde também o `.env` separadamente se usar Auvo. Para atualizar, rode novamente
`docker compose up -d --build`. O volume é preservado. `docker compose down`
também preserva os dados; `docker compose down -v` apaga os volumes.

## Validação

Após o ajuste para proxy: validado HTTP na porta 3000, healthcheck HTTP, login e
sessão com origem pública HTTPS, cookie Secure/HttpOnly e rejeição de uma origem
externa com HTTP 403. O teste usou a imagem compilada e os scripts Docker
atualizados montados, sem repetir o build do frontend.

Validado em container: build, aplicação das 13 migrations, página de login,
sessão autenticada, criação/download de backup no R2 local e persistência de
registros e arquivos após reiniciar. A etapa final da imagem foi testada
reaproveitando o build já concluído, devido ao pouco espaço no disco do host.

A confirmação dos salvamentos auditados usa `SELECT changes()` imediatamente
após cada escrita, na mesma transação, para contar somente as linhas alteradas
pelo comando do app. O `meta.changes` bruto do D1 também inclui os triggers de
histórico e provocava HTTP 409 mesmo quando o registro havia sido salvo.

Validado com D1/Miniflare e as migrations reais nas seis tabelas auditadas:
criação, edição, exclusão, lotes, rollback, concorrência e preservação dos dados
de auditoria. Os endpoints reais de notas, vendas, preços, conferência mensal e
fotos também foram exercitados. Rode a regressão com:

```sh
node --experimental-strip-types --test tests/audited-saves.test.mjs
```

Referência do armazenamento local e da opção `--persist-to`:
[documentação do D1](https://developers.cloudflare.com/d1/best-practices/local-development/).
