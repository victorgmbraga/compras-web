import { assert } from './errors.js';

const defaults = {
  HOST: '127.0.0.1', PORT: 8000,
  PNCP_SEARCH_BASE_URL: 'https://pncp.gov.br/api/search',
  PNCP_DETAIL_BASE_URL: 'https://pncp.gov.br/api/pncp/v1',
  PNCP_CONNECT_TIMEOUT_SECONDS: 5, PNCP_READ_TIMEOUT_SECONDS: 30,
  PNCP_OPERATION_TIMEOUT_SECONDS: 120, PNCP_MAX_RETRIES: 2,
  PNCP_MAX_CONCURRENT_REQUESTS: 2, PNCP_REQUESTS_PER_SECOND: 2,
  PNCP_MAX_CONCURRENT_OPERATIONS: 4, PNCP_PAGE_SIZE: 50,
  PNCP_MAX_DETAIL_ITEMS: 20000,
  PNCP_MAX_EXPORT_DOCUMENTS: 10000, PNCP_MAX_EXPORT_BYTES: 50 * 1024 * 1024,
  PNCP_MAX_OPERATION_BYTES: 100 * 1024 * 1024,
  PNCP_MAX_REQUESTS_PER_OPERATION: 1000, PNCP_VALIDATED_FILTERS: '', DEMO_MODE: false,
};
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
  return config;
}
