import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prepareSources } from './portable-data.mjs';
const project = fileURLToPath(new URL('../', import.meta.url));
await prepareSources(fileURLToPath(new URL('../migration/initial/', import.meta.url)), project);

// The migration archive remains an immutable historical snapshot. Apply current
// payroll reminder removals after restoring its source data for the Docker build.
const operationsPath = resolve(project, 'data/operations.json');
const operations = JSON.parse(await readFile(operationsPath, 'utf8'));
const removedPayrollReminders = new Set([
  'Simão: outra multa em 3 parcelas de R$ 100,00, de fevereiro a abril.',
  'Não esquecer das horas extras do Esdras.',
]);
operations.payrollMeta.reminders = (operations.payrollMeta.reminders ?? [])
  .filter(reminder => !removedPayrollReminders.has(reminder));
await writeFile(operationsPath, `${JSON.stringify(operations, null, 2)}\n`);
