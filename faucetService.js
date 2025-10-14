const { PrismaClient } = require("@prisma/client");
const dayjs = require("dayjs");
const Logger = require("./logger");
const { sendMessage } = require("./nostrPool");

const prisma = new PrismaClient();
const logger = new Logger("faucet-service");
const { ASSET_TYPE, CAN_CLAIM_ASSETS } = require("./constant");
class FaucetService {
  /**
   * Check if user can claim (rate limiting based on configured seconds)
   * Returns { canClaim: boolean, nextClaimTime: number|null, remainingSeconds: number|null }
   */
  async canClaim(nostrAddress, assetId, assetType) {
    const rateLimitSeconds =
      parseInt(process.env.CLAIM_RATE_LIMIT_SECONDS) || 86400; // Default 24 hours
    const limitTime = dayjs().subtract(rateLimitSeconds, "second").toDate();

    const record = await prisma.faucetRecord.findFirst({
      where: {
        nostrAddress,
        assetId,
        assetType,
        claimTime: {
          gte: limitTime,
        },
        status: {
          in: ["pending", "success"],
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
  getClaimAmount(assetId) {
    const asset = CAN_CLAIM_ASSETS.find((asset) => asset.assetId === assetId);
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

    const validAssetTypes = ["BTC_TAPROOT", "BTC_RGB", "TAPROOT", "RGB"];
    if (!validAssetTypes.includes(assetType)) {
      throw new Error(
        "Invalid asset type. Must be: BTC_TAPROOT, BTC_RGB, TAPROOT, or RGB"
      );
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
    rate_limit = false,
  }) {
    try {
      // Validate request
      this.validateClaimRequest({ nostrAddress, assetType, invoice });

      const existingInvoice = await prisma.faucetRecord.findFirst({
        where: {
          invoice,
        },
      });

      if (existingInvoice) {
        return {
          success: false,
          message: "Invoice already submitted, please do not resubmit",
        };
      }

      if (rate_limit) {
        // Check rate limit
        const claimCheck = await this.canClaim(
          nostrAddress,
          assetId,
          assetType
        );
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

      // Get claim amount
      const amount = this.getClaimAmount(assetId);

      // Create pending record
      const record = await prisma.faucetRecord.create({
        data: {
          nostrAddress,
          amount,
          status: "pending",
          assetType,
          assetId: assetId || "",
          assetName: assetName,
          invoice,
        },
      });

      logger.info("Created faucet claim record", {
        recordId: record.id,
        nostrAddress,
        assetType,
      });

      // Prepare message for lnlink node
      let message = "";
      if (
        assetType === ASSET_TYPE.BTC_TAPROOT ||
        assetType === ASSET_TYPE.BTC_RGB
      ) {
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

      // Update record based on result
      if (result && result.code === 0) {
        let txHash = "";
        if (
          assetType === ASSET_TYPE.BTC_TAPROOT ||
          assetType === ASSET_TYPE.BTC_RGB
        ) {
          txHash = result.data?.txid;
        } else if (assetType === ASSET_TYPE.TAPROOT) {
          txHash = result.data?.transfer?.anchor_tx_hash;
        } else if (assetType === ASSET_TYPE.RGB) {
          txHash = result.data?.txid;
        }
        await prisma.faucetRecord.update({
          where: { id: record.id },
          data: {
            status: "success",
            txHash: txHash || null,
          },
        });

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
        await prisma.faucetRecord.update({
          where: { id: record.id },
          data: {
            status: "failed",
          },
        });

        logger.error("Faucet claim failed", { recordId: record.id, result });

        return {
          success: false,
          message: result?.message || "Claim failed",
        };
      }
    } catch (error) {
      logger.error("Error processing claim", error.message);
      throw error;
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
