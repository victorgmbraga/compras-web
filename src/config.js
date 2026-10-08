import { assert } from './errors.js';

import { defaults as portableDefaults, validateSettings } from './settings.js';
const defaults = { HOST: '127.0.0.1', PORT: 8000, PNCP_CONNECT_TIMEOUT_SECONDS: 5, ...portableDefaults };
export function loadConfig(env = process.env) {
  const config = { ...defaults };
  for (const [key, fallback] of Object.entries(defaults)) {
    if (env[key] === undefined || env[key] === '') continue;
    if (typeof fallback === 'number') {
      const n = Number(env[key]);
      assert(Number.isFinite(n) && n >= (key === 'PNCP_MAX_RETRIES' ? 0 : 1), 'INVALID_CONFIG', `Configuração inválida: ${key}.`);
      config[key] = n;
    } else if (typeof fallback === 'boolean') {
      assert(['true', 'false'].includes(env[key]), 'INVALID_CONFIG', `${key} deve ser true ou false.`);
      config[key] = env[key] === 'true';
    } else config[key] = env[key];
  }
  for (const key of ['PNCP_SEARCH_BASE_URL', 'PNCP_DETAIL_BASE_URL']) {
    const url = new URL(config[key]);
    assert(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, 'INVALID_CONFIG', `${key} exige URL base HTTPS sem credenciais, query ou fragmento.`);
    config[key] = url.href.replace(/\/$/, '');
  }
  assert(config.PNCP_MAX_EXPORT_DOCUMENTS <= 10000, 'INVALID_CONFIG', 'Limite de exportação não pode exceder a janela de 10000.');
  assert([10, 25, 50, 100].includes(config.PNCP_PAGE_SIZE), 'INVALID_CONFIG', 'PNCP_PAGE_SIZE deve ser 10, 25, 50 ou 100.');
  for (const key of Object.keys(config).filter(k => /MAX_|_PORT$|^PORT$|TIMEOUT_MS|PAGE_SIZE/.test(k))) {
    assert(Number.isInteger(config[key]), 'INVALID_CONFIG', `${key} deve ser inteiro.`);
  }
  assert(config.PORT <= 65535, 'INVALID_CONFIG', 'PORT deve ser no máximo 65535.');
  validateSettings(Object.fromEntries(Object.keys(portableDefaults).map(key => [key, config[key]])));
  return config;
}
