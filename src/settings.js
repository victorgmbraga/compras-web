import { assert, checkKeys } from './errors.js';

export const defaults = {
  PNCP_SEARCH_BASE_URL: 'https://pncp.gov.br/api/search',
  PNCP_DETAIL_BASE_URL: 'https://pncp.gov.br/api/pncp/v1',
  PNCP_READ_TIMEOUT_SECONDS: 30,
  PNCP_OPERATION_TIMEOUT_SECONDS: 120, PNCP_MAX_RETRIES: 2,
  PNCP_MAX_CONCURRENT_REQUESTS: 2, PNCP_REQUESTS_PER_SECOND: 2,
  PNCP_MAX_CONCURRENT_OPERATIONS: 4, PNCP_PAGE_SIZE: 50,
  PNCP_MAX_DETAIL_ITEMS: 20000,
  PNCP_MAX_EXPORT_DOCUMENTS: 10000, PNCP_MAX_EXPORT_BYTES: 50 * 1024 * 1024,
  PNCP_MAX_OPERATION_BYTES: 100 * 1024 * 1024,
  PNCP_MAX_REQUESTS_PER_OPERATION: 1000, PNCP_VALIDATED_FILTERS: '', DEMO_MODE: false,
};

export function validateSettings(input = {}) {
  checkKeys(input, Object.keys(defaults), 'configuração pública');
  const config = { ...defaults, ...input };
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = config[key];
    assert(typeof value === typeof fallback, 'INVALID_CONFIG', `Configuração inválida: ${key}.`);
    if (typeof fallback === 'number') {
      assert(Number.isFinite(value) && value >= (key === 'PNCP_MAX_RETRIES' ? 0 : 1), 'INVALID_CONFIG', `Configuração inválida: ${key}.`);
      if (key !== 'PNCP_REQUESTS_PER_SECOND') assert(Number.isInteger(value), 'INVALID_CONFIG', `${key} deve ser inteiro.`);
    }
  }
  for (const key of ['PNCP_SEARCH_BASE_URL', 'PNCP_DETAIL_BASE_URL']) {
    let url; try { url = new URL(config[key]); } catch { assert(false, 'INVALID_CONFIG', `${key} inválida.`); }
    assert(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, 'INVALID_CONFIG', `${key} exige URL base HTTPS sem credenciais, query ou fragmento.`);
    config[key] = url.href.replace(/\/$/, '');
  }
  assert(config.PNCP_MAX_EXPORT_DOCUMENTS <= 10000, 'INVALID_CONFIG', 'Limite de exportação não pode exceder a janela de 10000.');
  assert([10, 25, 50, 100].includes(config.PNCP_PAGE_SIZE), 'INVALID_CONFIG', 'PNCP_PAGE_SIZE deve ser 10, 25, 50 ou 100.');
  return config;
}
