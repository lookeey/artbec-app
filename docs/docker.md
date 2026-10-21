# Docker local

```sh
docker compose up -d --build
docker compose logs -f app
```

Abra https://localhost:3000 e aceite o certificado local autoassinado. HTTPS
preserva o cookie Secure usado pelo login. Use os usuários e senhas já configurados
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
Dados e anexos do site hospedado precisam ser exportados e importados à parte.
Não compartilhe esse volume com várias instâncias simultâneas.

## Configuração

O compose aceita variáveis pelo shell ou por um `.env` local:

```dotenv
ARTBEC_PORT=3000
ARTBEC_BIND_IP=127.0.0.1
# Opcionais, apenas para a integração Auvo:
AUVO_ENCRYPTION_KEY=
AUVO_WEBHOOK_SECRET=
```

Para salvar credenciais Auvo, defina uma chave de criptografia com pelo menos
32 caracteres e guarde a mesma chave junto dos backups. Por exemplo, gere uma com
`openssl rand -hex 32`. Se importar credenciais criptografadas, use a chave original.

Para acessar por outro computador, defina `ARTBEC_BIND_IP=0.0.0.0` e abra
`https://IP-DO-SERVIDOR:3000`. Se colocar um proxy na frente, preserve a origem
(host e protocolo) das requisições: a API confere o cabeçalho Origin.

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

Validado em container: build, aplicação das 13 migrations, página de login,
sessão autenticada, criação/download de backup no R2 local e persistência de
registros e arquivos após reiniciar. A etapa final da imagem foi testada
reaproveitando o build já concluído, devido ao pouco espaço no disco do host.

No teste de gravação de notas, o endpoint `/api/notes` respondeu HTTP 409 mesmo
com o registro persistido e legível após reiniciar. Isso precisa de investigação
na lógica de gravação/contagem de alterações do app; a configuração Docker não
altera essa lógica. Evite reenviar uma nota sem recarregar a lista nesse caso.

Referência do armazenamento local e da opção `--persist-to`:
[documentação do D1](https://developers.cloudflare.com/d1/best-practices/local-development/).
