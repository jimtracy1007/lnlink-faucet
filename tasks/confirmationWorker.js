const faucetService = require("../faucetService");
const Logger = require("../logger");

const logger = new Logger("confirmation-worker");

const DEFAULT_INTERVAL = parseInt(
  process.env.CONFIRMATION_WORKER_INTERVAL_MS || "60000",
  10
);

async function handlePendingConfirmations() {
  const pendingRecords = await faucetService.getPendingConfirmations();

  for (const record of pendingRecords) {
    const confirmed = await faucetService.checkAndUpdateConfirmation(record);
    if (confirmed) {
      logger.info("Transaction confirmed", {
        recordId: record.id,
        txHash: record.txHash,
      });
    } else {
      logger.info("Transaction still pending", {
        recordId: record.id,
        txHash: record.txHash,
      });
    }
  }
}

async function handleQueuedClaims() {
  const assetTypes = await faucetService.getAssetTypesWithQueue();
  for (const assetType of assetTypes) {
    const queue = await faucetService.findQueuedClaims(assetType);
    if (!queue.length) continue;

    const blockingRecord = await faucetService.getBlockingRecord(assetType);
    if (blockingRecord) {
      const confirmed = await faucetService.checkAndUpdateConfirmation(
        blockingRecord
      );
      if (!confirmed) {
        logger.info("Asset still blocked", { assetType });
        continue;
      }
    }

    const nextRecord = queue[0];
    const maxRetry = faucetService.getMaxRetryCount();
    if (nextRecord.retryCount >= maxRetry) {
      logger.warn("Queued record exceeded max retry", {
        recordId: nextRecord.id,
        assetType,
        retryCount: nextRecord.retryCount,
      });
      await faucetService.markFailed(nextRecord.id, "Max retry count exceeded");
      continue;
    }
    try {
      logger.info("Processing queued claim", {
        recordId: nextRecord.id,
        assetType,
      });
      await faucetService.resumeQueuedClaim(nextRecord);
    } catch (error) {
      logger.error("Failed to process queued claim", {
        recordId: nextRecord.id,
        error: error.message,
      });
      await faucetService.markFailed(nextRecord.id, error.message);
    }
  }
}

async function runWorkerCycle() {
  try {
    await handlePendingConfirmations();
    await handleQueuedClaims();
  } catch (error) {
    logger.error("Worker cycle failed", { error: error.message });
  }
}

function startWorker() {
  runWorkerCycle();
  return setInterval(runWorkerCycle, DEFAULT_INTERVAL);
}

module.exports = {
  startWorker,
  runWorkerCycle,
};
