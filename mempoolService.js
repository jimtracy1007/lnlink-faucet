const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const Logger = require('./logger');

const logger = new Logger('mempool-service');

class MempoolService {
  constructor() {
    this.baseUrl = process.env.MEMPOOL_API_BASE || 'http://regtest.lnfi.network:8889/api';
    this.confirmationBlocks = parseInt(process.env.MEMPOOL_CONFIRMATIONS || '1', 10);
  }

  buildUrl(path) {
    return `${this.baseUrl}${path}`;
  }

  async getTxStatus(txid) {
    if (!txid) {
      throw new Error('txid is required');
    }

    try {
      const response = await fetch(this.buildUrl(`/tx/${txid}`));
      if (!response.ok) {
        throw new Error(`mempool api error: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      logger.error('Failed to fetch tx status', { txid, error: error.message });
      throw error;
    }
  }
}

module.exports = new MempoolService();
