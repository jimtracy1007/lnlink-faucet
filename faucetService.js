const { PrismaClient } = require("@prisma/client");
const dayjs = require("dayjs");
const Logger = require("./logger");
const { sendMessage } = require("./nostrPool");
const mempoolService = require("./mempoolService");

const prisma = new PrismaClient();
const logger = new Logger("faucet-service");
const { ASSET_TYPE, CAN_CLAIM_ASSETS } = require("./constant");
const assetLocks = new Map();
class FaucetService {
  /**
   * Check if user can claim (rate limiting based on configured seconds)
   * Returns { canClaim: boolean, nextClaimTime: number|null, remainingSeconds: number|null }
   */
  async canClaim(nostrAddress, assetId) {
    const rateLimitSeconds =
      parseInt(process.env.CLAIM_RATE_LIMIT_SECONDS) || 86400; // Default 24 hours
    const limitTime = dayjs().subtract(rateLimitSeconds, "second").toDate();

    const record = await prisma.faucetRecord.findFirst({
      where: {
        nostrAddress,
        assetId,
        claimTime: {
          gte: limitTime,
        },
        status: {
          in: ["pending", "waiting_confirmation", "success", "queued"],
        },
      },
      orderBy: {
        claimTime: "desc",
      },
    });

    if (!record) {
      return {
        canClaim: true,
        nextClaimTime: null,
        remainingSeconds: null,
      };
    }

    const nextClaimTime = dayjs(record.claimTime)
      .add(rateLimitSeconds, "second")
      .toDate();
    const remainingSeconds = Math.max(
      0,
      Math.ceil(dayjs(nextClaimTime).diff(dayjs(), "second"))
    );

    return {
      canClaim: false,
      nextClaimTime: nextClaimTime.toISOString(),
      remainingSeconds,
    };
  }

  /**
   * Get claim amount from env
   */
  resolveAssetConfig(assetType, assetId) {
    if (assetId) {
      const assetById = CAN_CLAIM_ASSETS.find(
        (asset) => asset.assetId === assetId
      );
      if (assetById) {
        return assetById;
      }
    }

    return CAN_CLAIM_ASSETS.find((asset) => asset.assetType === assetType);
  }

  getClaimAmount(assetType, assetId) {
    const asset = this.resolveAssetConfig(assetType, assetId);
    if (!asset) {
      throw new Error("Invalid asset id");
    }
    return asset.amount;
  }

  /**
   * Validate claim request
   */
  validateClaimRequest({ nostrAddress, assetType, invoice }) {
    if (!nostrAddress || typeof nostrAddress !== "string") {
      throw new Error("Invalid nostr address");
    }

    const validAssetTypes = ["BTC", "TAPROOT", "RGB"];
    if (!validAssetTypes.includes(assetType)) {
      throw new Error("Invalid asset type. Must be: BTC, TAPROOT, or RGB");
    }

    if (!invoice || typeof invoice !== "string") {
      throw new Error("Invalid invoice or address");
    }

    // For btc, it should be an address; for taproot and rgb, it should be an invoice
    // You can add more specific validation here if needed

    return true;
  }

  combineQueryString(method, params = {}, nodeType) {
    const obj = {
      method,
      params,
    };
    if (nodeType) {
      obj.node_type = nodeType;
    }
    return JSON.stringify(obj);
  }

  getMaxRetryCount() {
    const value = parseInt(process.env.MAX_RETRY_COUNT || "3", 10);
    if (!Number.isInteger(value) || value <= 0) {
      return 3;
    }
    return value;
  }

  async withAssetLock(assetType, callback) {
    if (!assetType) {
      return callback();
    }

    const last = assetLocks.get(assetType) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
      release = () => {
        resolve();
        if (assetLocks.get(assetType) === current) {
          assetLocks.delete(assetType);
        }
      };
    });

    assetLocks.set(assetType, last.then(() => current));
    await last;
    try {
      return await callback();
    } finally {
      release();
    }
  }

  async enqueueClaim({
    nostrAddress,
    assetType,
    assetId,
    assetName,
    invoice,
    fee_rate,
  }) {
    const assetConfig = this.resolveAssetConfig(assetType, assetId);
    const amount = assetConfig?.amount || 0;
    const record = await prisma.faucetRecord.create({
      data: {
        nostrAddress,
        amount,
        status: "queued",
        assetType,
        assetId: assetConfig?.assetId || assetId || "",
        assetName,
        invoice,
        queuedAt: new Date(),
        retryCount: 0,
        txHash: null,
        feeRate: fee_rate || null,
      },
    });

    const queuePosition = await prisma.faucetRecord.count({
      where: {
        assetType: record.assetType,
        status: "queued",
      },
    });

    return { record, queuePosition };
  }

  async getBlockingRecord(assetType) {
    return prisma.faucetRecord.findFirst({
      where: {
        assetType,
        status: {
          in: ["pending", "waiting_confirmation"],
        },
      },
      orderBy: {
        claimTime: "desc",
      },
    });
  }

  async checkAndUpdateConfirmation(record) {
    if (!record?.txHash) {
      return false;
    }

    const maxRetry = this.getMaxRetryCount();
    if (record.retryCount >= maxRetry) {
      await this.markFailed(record.id, "Max retry count exceeded");
      return false;
    }

    try {
      const status = await mempoolService.getTxStatus(record.txHash);
      if (status?.status?.confirmed) {
        await prisma.faucetRecord.update({
          where: { id: record.id },
          data: {
            status: "success",
            confirmedAt: status.status.block_time
              ? new Date(status.status.block_time * 1000)
              : new Date(),
            lastCheckAt: new Date(),
          },
        });
        return true;
      }

      await prisma.faucetRecord.update({
        where: { id: record.id },
        data: {
          lastCheckAt: new Date(),
          retryCount: record.retryCount + 1,
        },
      });

      const newRetryCount = record.retryCount + 1;
      if (newRetryCount >= maxRetry) {
        await this.markFailed(record.id, "Max retry count exceeded");
      }
    } catch (error) {
      logger.warn("check confirmation failed", {
        recordId: record.id,
        error: error.message,
      });
    }

    return false;
  }

  async findQueuedClaims(assetType) {
    return prisma.faucetRecord.findMany({
      where: {
        assetType,
        status: "queued",
      },
      orderBy: {
        claimTime: "asc",
      },
    });
  }

  async getPendingConfirmations() {
    return prisma.faucetRecord.findMany({
      where: {
        status: "waiting_confirmation",
      },
      orderBy: {
        lastCheckAt: "asc",
      },
    });
  }

  async getAssetTypesWithQueue() {
    const records = await prisma.faucetRecord.findMany({
      where: {
        status: "queued",
      },
      distinct: ["assetType"],
      select: {
        assetType: true,
      },
    });

    return records.map((record) => record.assetType);
  }

  async markWaiting(recordId, txHash) {
    await prisma.faucetRecord.update({
      where: { id: recordId },
      data: {
        status: "waiting_confirmation",
        txHash: txHash,
        lastCheckAt: new Date(),
      },
    });
  }

  async markFailed(recordId, message) {
    await prisma.faucetRecord.update({
      where: { id: recordId },
      data: {
        status: "failed",
        lastCheckAt: new Date(),
      },
    });

    logger.error("Update record failed", {
      recordId,
      message,
    });
  }

  async resumeQueuedClaim(record) {
    return this.withAssetLock(record.assetType, async () => {
      const maxRetry = this.getMaxRetryCount();
      if (record.retryCount >= maxRetry) {
        throw new Error("Max retry count exceeded");
      }

      const updatedRecord = await prisma.faucetRecord.update({
        where: { id: record.id },
        data: {
          status: "pending",
          lastCheckAt: new Date(),
          retryCount: record.retryCount + 1,
          claimTime: new Date(),
        },
      });

      return this.executeClaim({
        record: updatedRecord,
        assetType: updatedRecord.assetType,
        assetId: updatedRecord.assetId,
        invoice: updatedRecord.invoice,
        fee_rate: updatedRecord.feeRate || 3,
      });
    });
  }
  /**
   * Process faucet claim
   */
  async processClaim({
    nostrAddress,
    assetType,
    invoice,
    assetName,
    assetId,
    fee_rate = 3,
    skipRateLimit = true,
  }) {
    return this.withAssetLock(assetType, async () => {
      try {
        this.validateClaimRequest({ nostrAddress, assetType, invoice });

        if (!skipRateLimit) {
          const claimCheck = await this.canClaim(nostrAddress, assetId);
          if (!claimCheck.canClaim) {
            const hours = Math.floor(claimCheck.remainingSeconds / 3600);
            const minutes = Math.floor((claimCheck.remainingSeconds % 3600) / 60);
            let timeStr = "";
            if (hours > 0) timeStr += `${hours} hour${hours > 1 ? "s" : ""}`;
            if (minutes > 0)
              timeStr += `${hours > 0 ? " " : ""}${minutes} minute${
                minutes > 1 ? "s" : ""
              }`;
            if (!timeStr) timeStr = `${claimCheck.remainingSeconds} seconds`;
            throw new Error(`Please wait ${timeStr} before claiming again`);
          }
        }

        const blockingRecord = await this.getBlockingRecord(assetType);
        if (blockingRecord) {
          const confirmed = await this.checkAndUpdateConfirmation(blockingRecord);
          if (!confirmed) {
            const { queuePosition } = await this.enqueueClaim({
              nostrAddress,
              assetType,
              assetId,
              assetName,
              invoice,
              fee_rate,
            });

            return {
              success: true,
              status: "queued",
              message:
                "Previous transaction pending confirmation. Request queued.",
              queuePosition,
            };
          }
        }

        const assetConfig = this.resolveAssetConfig(assetType, assetId);
        const amount = assetConfig?.amount;
        if (!amount) {
          throw new Error("Invalid asset id");
        }

        const record = await prisma.faucetRecord.create({
          data: {
            nostrAddress,
            amount,
            status: "pending",
            assetType,
            assetId: assetConfig.assetId || assetId || "",
            assetName,
            invoice,
            feeRate: fee_rate || null,
          },
        });

        return this.executeClaim({
          record,
          assetType,
          assetId: assetConfig.assetId || assetId,
          invoice,
          fee_rate,
        });
      } catch (error) {
        logger.error("Error processing claim", error.message);
        throw error;
      }
    });
  }

  async executeClaim({ record, assetType, assetId, invoice, fee_rate = 3 }) {
    const amount = record.amount;

    logger.info("Created faucet claim record", {
      recordId: record.id,
      nostrAddress: record.nostrAddress,
      assetType,
    });

    // Prepare message for lnlink node
    let message = "";
    if (assetType === ASSET_TYPE.BTC || !assetId) {
      message = this.combineQueryString("sendCoins", {
        addr: invoice,
        amount: amount,
        sat_per_vbyte: 3,
      });
    } else if (assetType === ASSET_TYPE.TAPROOT) {
      message = this.combineQueryString("sendTapdAssets", {
        tap_addrs: [invoice],
      });
    } else if (assetType === ASSET_TYPE.RGB) {
      message = this.combineQueryString(
        "payRgbInvoice",
        {
          invoice: invoice,
          amount: amount,
          asset_id: assetId,
          fee_rate: fee_rate,
        },
        "rgb"
      );
    }

    // Send to nostr (lnlink node)
    logger.info("Sending claim request to lnlink node", {
      recordId: record.id,
    });

    const result = await sendMessage({ message, kind: 4 });
    // console.log("🚀 ~ FaucetService ~ executeClaim ~ result:", result)
    logger.info("Claim result", {
      recordId: record.id,
      result,
    });

    // Update record based on result
    if (result && result.code === 0) {
      let txHash = "";
      if (assetType === ASSET_TYPE.BTC) {
        txHash = result.data?.txid;
      } else if (assetType === ASSET_TYPE.TAPROOT) {
        txHash = result.data?.transfer?.anchor_tx_hash;
      } else if (assetType === ASSET_TYPE.RGB) {
        txHash = result.data?.txid;
      }
      await this.markWaiting(record.id, result.data?.txid || null);

      logger.info("Faucet claim successful", {
        recordId: record.id,
        txHash: txHash,
      });
      return {
        success: true,
        message: "Claim successful",
        txHash: txHash,
        amount,
        assetType,
      };
    } else {
      await this.markFailed(record.id, result?.message || "Claim failed");

      return {
        success: false,
        message: result?.message || "Claim failed",
      };
    }
  }

  /**
   * Get claim history for a nostr address
   */
  async getClaimHistory(nostrAddress, limit = 10) {
    const records = await prisma.faucetRecord.findMany({
      where: { nostrAddress },
      orderBy: { claimTime: "desc" },
      take: limit,
    });

    return records;
  }

  /**
   * Get all claims (admin)
   */
  async getAllClaims(page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [records, total] = await Promise.all([
      prisma.faucetRecord.findMany({
        orderBy: { claimTime: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.faucetRecord.count(),
    ]);

    return {
      records,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}

module.exports = new FaucetService();
