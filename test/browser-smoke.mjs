import { build } from 'vite';
await build({ mode: 'test' });
await import('./ui-smoke.mjs');
await import('./filter-options-cache.browser.mjs');
await build();
await import('./browser-artifact.mjs');
