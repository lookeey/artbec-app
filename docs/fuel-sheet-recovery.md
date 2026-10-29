# Recuperação da gasolina em 29/10/2026

A planilha atualizada `Artbec - Vendas - Estoque e Motos.xlsx`, aba
`Controle Gasolina.2026`, contém 38 abastecimentos válidos novos em relação à
base importada: 12 de setembro e 26 de outubro. Os 293 registros antigos dessa
aba continuam presentes na planilha. Linhas foram inseridas no meio da tabela;
por isso, o número da linha já não identifica o mesmo abastecimento da versão
original. A comparação usa técnico, data, placa e valor, normalizando apenas
maiúsculas, acentos e espaços do nome.

O extrator `scripts/extract-fuel-recovery.py` somente lê o XLSX. O pacote
`migration/fuel-recovery-2026-10-29.json` guarda exclusivamente os novos dados,
com nome e SHA-256 da cópia conferida, aba, linha de origem e data de corte.
Não inclui lançamentos de outros anos ou datas futuras, resumos mensais,
fórmulas nem a planilha inteira. Os IDs usam o conteúdo, evitando colisões com
os antigos IDs por linha. Os nomes e placas da planilha são preservados.

## Registros já existentes

Na base e no site conferidos, três desses 38 abastecimentos já foram cadastrados
manualmente: Nicolas em 01/10, Vasco em 03/10 e Genilson em 05/10. A recuperação
inclui os outros **35** (12 de setembro e 23 de outubro), totalizando
**R$ 1.736,71** em novos lançamentos. Não altera os registros manuais, inclusive
quando a planilha diverge por placa ou centavos. O manual do Vasco permanece
R$ 50,00 e placa FCC7G74; o de Genilson mantém GDM8147. Não se presume que uma
placa parecida seja a mesma para alterar dados existentes.

Há também uma data digitada como `02/10/-2026` na linha 230. Essa linha não é
importada nem corrigida automaticamente. O abastecimento de Esdras de
02/10/2026 já existe no site com valor R$ 50,00 e é preservado.

Referência de outubro após a recuperação, mantendo os manuais conferidos:

| Técnico | Registros | Total |
| --- | ---: | ---: |
| Esdras | 8 | R$ 386,69 |
| Genilson | 5 | R$ 250,00 |
| Nicolas | 8 | R$ 400,00 |
| Vasco | 6 | R$ 300,00 |
| Total | 27 | R$ 1.336,69 |

Edições posteriores prevalecem e podem mudar esses totais.

## Inicialização e preservação

O entrypoint executa `docker/recover-fuel-sheet.mjs` depois da importação
inicial e antes de abrir o servidor. O pacote tem checksum fixado, com LF
preservado no Windows e Docker Linux. A recuperação valida o escopo e só faz
inclusões; não altera a base original nem atualiza cadastros existentes.

Ela mescla os abastecimentos da base com as mudanças do banco antes de comparar.
IDs gravados e excluídos são protegidos, assim como exclusões identificadas pelo
conteúdo original e pelo histórico de auditoria. Um cadastro manual existente
para a mesma pessoa e data é preservado para conferência, mesmo que a placa ou
o valor divirjam. Não se duplicam nem se corrigem esses conflitos automaticamente.

As inclusões, a auditoria e o marcador
`fuel-sheet-additions-2026-10-29-v1` em `_artbec_data_repairs` são atômicos.
Uma falha reverte o lote inteiro; o servidor só inicia após o sucesso. Após
conclusão, reinícios não repetem a recuperação nem desfazem edições/exclusões
posteriores. Nenhum técnico removido é recriado. Os cadastros dos técnicos,
óleo, vendas, Vita, estoque e os demais dados permanecem intactos.

## Validação e reprodução

```sh
python scripts/extract-fuel-recovery.py "caminho/Artbec - Vendas - Estoque e Motos.xlsx" migration/fuel-recovery-2026-10-29.json --through 2026-10-29
node --test docker/recover-fuel-sheet.test.mjs
```

A extração usa Python com `openpyxl`, sem editar o XLSX. Se a planilha mudar,
revise o pacote e o checksum antes de publicar. O XLSX não precisa ser copiado
para o Dokploy: os dados necessários já estão na imagem Docker.

Os testes usam o export real em D1/Miniflare: conferem os 35 novos registros,
os totais por técnico/mês, valores em centavos, preservação exata das tabelas
existentes e manuais, auditoria, rollback, exclusões por ID e por histórico,
e reinício persistente com edições posteriores.
