# Tarefas a resolver por mês

Cada tarefa tem uma competência `period` (AAAA-MM). As tarefas antigas usam o
mês de `createdAt` no fuso America/Sao_Paulo. O seletor mensal da tela filtra
lista, busca, categorias, contadores e histórico. Novas tarefas entram no mês
selecionado; o mês de um registro existente não pode ser movido pela edição.

Ao acessar as tarefas ou os alertas do início, o servidor repete as tarefas
abertas até o mês atual. A tela verifica a virada de mês e o retorno à janela
para atualizar a lista sem recarregar a página. Não são antecipados meses
futuros. Os alertas do início contam somente as tarefas do mês atual.

A cópia mantém título, detalhes, responsável, prioridade, etapas já marcadas e
prazo original, que continua vencido se necessário. `recurrenceRootId`,
`carriedFrom` e `carriedFromPeriod` ligam os meses; o cartão informa a origem.
O registro anterior permanece no histórico. Concluir a cópia mais recente
interrompe a repetição. Uma exclusão da cópia impede recriá-la e impede que ela
seja repetida no mês seguinte; os meses anteriores continuam preservados.

O ID da cópia é estável por tarefa original e mês. Inclusões ignoram IDs já
existentes, incluindo exclusões, sem sobrescrever edições. A escrita confere
versão e estado aberto da tarefa anterior para proteger conclusões concorrentes.
As cópias passam pela auditoria como repetição mensal do sistema. Não há alteração
no esquema do banco nem dependência de cron externo.

```sh
node --experimental-strip-types --test lib/resolution-task-periods.test.ts lib/resolution-task.test.ts
```

Os testes conferem virada de ano e fuso, meses sem acesso, etapas e prazo,
histórico, edições, conclusão, exclusão, concorrência, rollback e CRUD da API.
