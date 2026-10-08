import { Buffer } from 'node:buffer';
import { QueryService as PortableService } from './query-core.js';

export class QueryService extends PortableService {
  async export(input, signal, requestId, options = {}) {
    const { chunks, metadata } = await super.export(input, signal, requestId, { ...options, includeDocuments: true });
    return { csv: Buffer.concat(chunks), metadata };
  }
}
