import { build } from 'vite';
await build({ mode: 'test' });
process.env.COMPRAS_QA_STATIC = '1';
await import('./ui-smoke.mjs');
await build();
await import('./browser-artifact.mjs');
