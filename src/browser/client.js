import { PncpClient } from '../pncp-core.js';
import { defaults, validateSettings } from '../settings.js';
import { assert } from '../errors.js';
import { demoFetch } from '../demo.js';

export function browserSettings(input = {}) {
  const config = validateSettings(input);
  for (const key of ['PNCP_SEARCH_BASE_URL', 'PNCP_DETAIL_BASE_URL']) {
    assert(config[key] === defaults[key], 'INVALID_CONFIG', `${key} deve usar a API pública do PNCP.`);
  }
  return config;
}

export function createBrowserClient(config, { fetcher = globalThis.fetch.bind(globalThis), demoFetcher = demoFetch } = {}) {
  return new PncpClient(config, {
    fetcher: config.DEMO_MODE ? demoFetcher : fetcher,
    fetchOptions: { mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } },
  });
}
