# Recuperação das saídas Vita de abril a agosto de 2026

A importação antiga omitiu saídas cujo valor estava em branco. As linhas tinham
produtos e datas, mas não apareciam no site. Em 27/10/2026 foram conferidas as
abas Vita da planilha original e da cópia local atualizada: as 50 linhas do
período coincidem nas duas cópias.

| Mês de 2026 | Morumbi | Higienópolis | Total |
| --- | ---: | ---: | ---: |
| Abril | 4 | 6 | 10 |
| Maio | 5 | 5 | 10 |
| Junho | 2 | 4 | 6 |
| Julho | 5 | 8 | 13 |
| Agosto | 3 | 8 | 11 |

O pacote `migration/vita-history-2026-04-08.json` contém somente essas saídas,
com nome e SHA-256 da planilha, aba e linha de origem. Não inclui a planilha
inteira nem dados de outros meses. O registro `sale-v-julho-vita-21` (R$ 380,00)
já existe na base e permanece intacto. Na base de produção conferida, faltam as
outras 49 saídas. Valores vazios permanecem `null`; não recebem preços atuais
nem pagamento presumido. Os cadastros recuperados ficam com pagamento a
conferir. Descrições e datas são mantidas, inclusive abreviações do original.

## Inicialização e preservação

`docker/recover-vita-history.mjs` verifica o checksum do pacote e seu escopo.
O entrypoint executa a recuperação depois de `import-initial-data.mjs`: assim,
ela funciona tanto em um volume existente quanto na primeira inicialização de
um volume novo, sem ser apagada pela importação inicial.

A recuperação compara IDs e pares aba/linha com a base e com o banco persistido.
Qualquer ID já gravado, inclusive excluído ou pertencente a outra entidade, é
preservado. Registros com a mesma aba/linha sob outro ID também são preservados.
As inclusões, a auditoria e o marcador
`vita-deliveries-2026-04-through-08-v1` em `_artbec_data_repairs` são atômicos.
Uma falha reverte o lote e impede abrir o servidor. Após sucesso, reinícios não
reimportam nem recriam itens editados ou excluídos posteriormente.

Outubro e os demais meses não são modificados. As saídas recuperadas pertencem
ao histórico: ficam entregues, com a data da planilha em `deliveryDate`,
`deliveredAt` vazio e `stockItems: []`, sem diminuir o estoque atual, criar
retiradas ou mudar alocações existentes. O fechamento usa a data de entrega
conforme a regra já publicada.

## Reprodução e validação

O extrator só lê o XLSX. Requer Python com `openpyxl`:

```sh
python scripts/extract-vita-history.py "caminho/Artbec - Vendas - Estoque e Motossss.xlsx" migration/vita-history-2026-04-08.json
node --test docker/recover-vita-history.test.mjs
```

Use `--compare-workbook caminho/segunda-copia.xlsx` para confirmar as mesmas
linhas em outra cópia. Se o pacote mudar, revise sua origem e atualize o
checksum fixado no recuperador antes de publicar.

Os testes usam o export migrado real no D1/Miniflare: conferem as 49 inclusões,
contagens por unidade/mês, preservação exata de outubro e das demais tabelas,
auditoria, conflitos com cadastros existentes, exclusões, rollback e reinício
com edições posteriores. O pacote contém os dados necessários ao Docker; o
XLSX original não precisa ser enviado ao servidor.
