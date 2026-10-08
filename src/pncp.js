import { Agent, EnvHttpProxyAgent, fetch as undiciFetch } from 'undici';
import { PncpClient as PortableClient } from './pncp-core.js';
export { delay, operation, serializeSearch, normalizeOptions, normalizeCatalog } from './pncp-core.js';

export class PncpClient extends PortableClient {
  constructor(config, { fetcher, logger } = {}) {
    const dispatcher = fetcher ? null : process.env.HTTPS_PROXY || process.env.HTTP_PROXY
      ? new EnvHttpProxyAgent({ connect: { timeout: config.PNCP_CONNECT_TIMEOUT_SECONDS * 1000 } })
      : new Agent({ connect: { timeout: config.PNCP_CONNECT_TIMEOUT_SECONDS * 1000 } });
    super(config, { fetcher: fetcher || ((url, options) => undiciFetch(url, { ...options, dispatcher })), logger,
      fetchOptions: { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', 'User-Agent': 'ComprasWeb/2.0 PNCP read-only client' } } });
    this.dispatcher = dispatcher;
  }
  async close() { await this.dispatcher?.close(); }
}
