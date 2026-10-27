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
## Preenchimento dos preços antigos em 27/10/2026

A pedido da administração, uma segunda etapa (`docker/price-vita-history.mjs`)
preenche os preços das 49 saídas recuperadas. O pacote separado
`migration/vita-history-prices-2026-04-08.json` registra os itens, os cálculos e
as células de origem de cada preço no mesmo XLSX original. O pacote da primeira
recuperação permanece intacto.

Os preços específicos do Vita são extraídos de saídas já preenchidas de janeiro
a março: cloro líquido 5 L R$ 40,00; redutor de pH 5 L R$ 85,00; elevador de
alcalinidade R$ 50,00; algicida manutenção HTH e algicida choque HTH R$ 45,00;
cloro granulado HTH R$ 350,00. Os demais preços vêm da aba `Valores Produtos`
da cópia original: clarificante R$ 30,00, removedor de oleosidade R$ 45,00,
kit de pastilha em gel R$ 47,00, mangueira R$ 22,00/metro e ponteira R$ 8,00.
Não são usados os preços atuais do site. Cloro e redutor sem tamanho explícito
são galões de 5 L, conforme confirmação da administração.

**Tratamento Semanal fica sem valor**, conforme solicitado. Há quatro saídas
com esse item. Seu preço permanece `null`, e o total soma somente os outros
produtos. O cartão e o editor identificam esse subtotal. A exceção de preço
pendente é restrita aos quatro IDs históricos e suas competências; outras
vendas continuam exigindo preços completos. Se o preço for informado depois,
ele volta a entrar no total normalmente. As descrições originais são mantidas.

| Competência | Morumbi | Higienópolis |
| --- | ---: | ---: |
| 04/2026 | R$ 927,00 | R$ 1.890,00 |
| 05/2026 | R$ 1.400,00 | R$ 1.520,00 |
| 06/2026 | R$ 540,00 | R$ 1.140,00 |
| 07/2026 | R$ 1.340,00 | R$ 1.667,00 |
| 08/2026 | R$ 640,00 | R$ 1.533,00 |

Julho/Morumbi inclui os R$ 380,00 já existentes, que não são alterados. Esses
valores excluem o Tratamento Semanal. Se um cadastro foi editado desde a
recuperação, o valor atual é preservado e pode divergir destes totais de referência.

A etapa executa depois da recuperação de saídas, antes do servidor iniciar.
Só atualiza cadastros ativos, ainda sem valor, quantidade, preço unitário ou
itens próprios, cuja descrição, unidade, competência, origem e datas continuam
iguais às recuperadas. Cadastros excluídos, movidos para outubro ou editados
são preservados, assim como pagamentos e campos não financeiros. O estoque e
outubro ficam intactos. Um marcador separado impede repetir o preenchimento
nos reinícios, inclusive se o usuário apagar o valor posteriormente.

O lote financeiro e a auditoria são atômicos. O marcador guarda as imagens
anteriores e os preços usados. A atualização usa a versão lida do cadastro e
não sobrescreve uma edição concorrente. A contagem de alterações usa
`SELECT changes()` na mesma transação, sem somar as escritas dos triggers.

Reprodução (somente leitura do XLSX) e testes:

```sh
python scripts/prepare-vita-history-prices.py "caminho/Artbec - Vendas - Estoque e Motossss.xlsx" migration/vita-history-prices-2026-04-08.json
node --experimental-strip-types --test docker/price-vita-history.test.mjs lib/sale-lines.test.ts tests/access-boundaries-api.test.ts
```

O novo pacote usa LF fixo para manter o checksum idêntico no Windows e no Docker
Linux. Os testes cobrem preços e quantidades, subtotais dos itens conhecidos,
validação da API, edições anteriores e posteriores, preservação de outubro e
estoque, auditoria, rollback e reinício persistente.
