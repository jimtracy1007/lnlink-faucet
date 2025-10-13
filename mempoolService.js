const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const { ASSET_TYPE, CAN_CLAIM_ASSETS } = require("./constant");
const Logger = require("./logger");
const { sendMessage } = require("./nostrPool");
const { combineQueryString } = require("./utils");
const logger = new Logger("mempool-service");

class MempoolService {
  constructor() {
    this.baseUrl =
      process.env.MEMPOOL_API_BASE || "http://regtest.lnfi.network:8889/api";
    this.confirmationBlocks = parseInt(
      process.env.MEMPOOL_CONFIRMATIONS || "1",
      10
    );
  }

  buildUrl(path) {
    return `${this.baseUrl}${path}`;
  }

  async getTxStatus(record) {
    const txid = record.txHash;
    if (!txid) {
      throw new Error("txid is required");
    }
    try {
      if (record.assetType === ASSET_TYPE.TAPROOT) {
        const assetId = CAN_CLAIM_ASSETS.find(
          (item) => item.assetType === record.assetType
        )?.assetId;
        const sendArgs = {
          transaction_kind: "onchain",
          direction: "out",
          asset_id: assetId,
          page_index: 1,
          page_size: 20,
        };

        const message = combineQueryString("getTransactions", sendArgs);

        const ret = await sendMessage({ message, kind: 4 });

        if (ret && ret.code === 0) {
          const data = ret.data;
          const trans = data?.list;
          const tran = trans.find((item) => item.tx_hash === txid);
          if (tran) {
            return {
              status:
                tran.status == 1
                  ? {
                      confirmed: true,
                      block_time: tran.update_at,
                    }
                  : {
                      confirmed: false,
                    },
            };
          }
        }
      } else {
        const response = await fetch(this.buildUrl(`/tx/${txid}`));
        if (!response.ok) {
          throw new Error(`mempool api error: ${response.status}`);
        }

        const data = await response.json();
        return data;
      }
    } catch (error) {
      logger.error("Failed to fetch tx status", { txid, error: error.message });
      throw error;
    }
  }
}

module.exports = new MempoolService();
