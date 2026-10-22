import { fileURLToPath } from 'node:url';
import { prepareSources } from './portable-data.mjs';
const project = fileURLToPath(new URL('../', import.meta.url));
await prepareSources(fileURLToPath(new URL('../migration/initial/', import.meta.url)), project);
