# Recuperação do óleo de 2026

Fonte: aba `Controle Óleo 26` da planilha atualizada em 29/10/2026. O extrator
`scripts/extract-oil-recovery.py` apenas lê o XLSX e grava o pacote versionado
`migration/oil-recovery-2026-10-29.json`, com checksum da fonte e linha de origem.
Não se modifica o XLSX nem se usa o total de uma fórmula como despesa avulsa.

A base contém 152 linhas de 2026. O complemento inclui 19 lançamentos ausentes
(5 de setembro e 14 de outubro), restaura quatro exclusões antigas de setembro
e preserva os registros já cadastrados, inclusive as trocas manuais. Os 19 novos
lançamentos somam R$ 196,00; leituras sem preço não ganham valor fictício.
Uma exclusão manual de Vasco em 28/09 permanece excluída. Linhas vazias,
férias e anotações sem leitura, troca ou despesa não viram novos lançamentos.
Kevin em 14/09 e Genilson em 14/09 são recuperados sem sobrescrever os IDs
originais, que tinham sido reaproveitados para outras datas no site.

A comparação usa responsável, data e placa. Mantém as normalizações históricas
de nomes (`John` para `Johnn`, caixa/acentos e `Vasco]` para `Vasco`). A grafia
incompleta `FUAE40` do histórico de Esdras corresponde à moto `FUA2E40`, conferida
com o cadastro e os registros manuais. As outras placas não são corrigidas por
semelhança. O histórico de ex-funcionários não cria novos cadastros de técnicos.

## Fórmula e referências

São preparados cinco cartões, um por moto atual, reaproveitando o cartão ativo
de Esdras. A leitura mais recente e a última troca vêm da planilha. Por escolha
expressa da administração, o KM da linha da troca é uma referência aproximada,
mesmo quando a data da troca é posterior à leitura. O cartão informa essa
aproximação e mantém visível a data real da leitura original.

| Responsável | Placa | KM atual | Última troca (KM de referência) | Próxima troca | KM restantes |
| --- | --- | ---: | ---: | ---: | ---: |
| Esdras | FUA2E40 | 261.202 | 260.903 | 261.903 | 701 |
| Vasco | FCC7G74 | 59.527 | 58.912 | 59.912 | 385 |
| Genilson | GDM8147 | 178.235 | 177.737 | 178.737 | 502 |
| Kevin | GIM5J14 | 78.833 | 78.230 | 79.230 | 397 |
| Nicolas | FLO3A78 | 124.094 | 124.094 | 125.094 | 1.000 |

A fórmula existente continua: próxima troca = KM da última troca + 1.000;
restante = próxima troca - KM atual. Somente uma nova troca reinicia o ciclo.
Revisão = KM da última revisão + 5.000. Sem referência de revisão na fonte,
ela permanece `A configurar`; não se presume uma revisão junto com uma troca.
Nicolas tem leitura de 20/10 e troca de 21/10 na mesma linha: o evento aproximado
de troca mantém o controle em 21/10, e o cartão exibe a leitura de 20/10.

## Preservação e inicialização

`docker/recover-oil-2026.mjs` executa depois da importação inicial e antes de
abrir o servidor. Só restaura as quatro exclusões com versão, conteúdo e data
exatamente iguais ao export original. Cadastros ativos para o mesmo responsável,
data e placa, novas exclusões e cartões editados/arquivados depois do export
prevalecem. Cartões atuais de uma placa não são duplicados. Revisões, pedidos e
histórico existentes são mantidos ao atualizar o cartão antigo de Esdras.

O lote de histórico, cartões, auditoria e marcador
`oil-2026-history-and-monitors-2026-10-29-v1` em `_artbec_data_repairs` é atômico.
Uma falha reverte todo o lote. Reinícios não repetem a migração nem desfazem
edições, exclusões ou arquivamentos posteriores. Dados de 2025, gasolina,
estoque, vendas e demais tabelas permanecem intactos.

```sh
python scripts/extract-oil-recovery.py "caminho/Artbec - Vendas - Estoque e Motos.xlsx" migration/oil-recovery-2026-10-29.json
node --experimental-strip-types --test docker/recover-oil-2026.test.mjs lib/oil-monitor.test.ts
```

Os testes D1/Miniflare carregam o export real: conferem 19 inclusões, quatro
restaurações, cinco cartões, totais de setembro/outubro, fórmula de cada moto,
revisões ausentes, cadastros manuais, outras tabelas, auditoria, rollback e
reinício persistente após alterações. Referência de outubro: 15 lançamentos,
R$ 238,00 em preços informados, incluindo a troca manual de Esdras de R$ 42,00.

Os novos lançamentos usam o mesmo ID diário (placa/data) do controle de óleo.
Atualizar a leitura importada no mesmo dia reaproveita o registro, sem duplicar.

## Trocas no Wellington

A conferência das células H:K da aba `Controle Óleo 26` encontrou 12 indicações
explícitas de `Well`, `Welly`, `Well trocou`, `Well.trocou` ou equivalentes de
caixa. Elas passam a constar como **Trocado no Wellington**. A observação também
aparece nos detalhes dos cartões de gastos, além da lista completa e da edição.

O complemento `docker/annotate-oil-wellington.mjs` roda após a importação do óleo,
com pacote `migration/oil-wellington-2026.json` extraído sem editar o XLSX.
Corrige somente observação, tipo de lançamento para troca e versão. Datas,
quilometragens, valores, cartões e a fórmula permanecem iguais. Preços ausentes
continuam ausentes. Observações históricas separadas são preservadas; dizer
apenas que a moto estava no Wellington não comprova troca e não recebe o rótulo.

Somente registros exatamente iguais aos conferidos são anotados. Novas edições
ou exclusões prevalecem. O lote de observações, auditoria, valores anteriores e
marcador `oil-wellington-labels-2026-10-29-v1` é atômico e executado uma vez.
Reinícios preservam notas, exclusões e alterações posteriores.

```sh
python scripts/extract-oil-wellington.py "caminho/Artbec - Vendas - Estoque e Motos.xlsx" migration/oil-wellington-2026.json
node --test docker/annotate-oil-wellington.test.mjs
```

O cartão da última troca mostra o local somente quando placa, KM e data da troca
coincidem com o lançamento confirmado. Uma troca posterior não herda esse local.
